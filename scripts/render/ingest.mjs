// Turns a real product photo (dropped into scripts/render/inbox/<handle>.png|jpg|webp) into the same image set the 3D renderer
// produces: background removal, tidy framing, and simple pack composites. Needs only `sharp`.
import sharp from 'sharp';

export const INBOX_EXT = ['.png', '.webp', '.jpg', '.jpeg'];

// flood-fills from the borders over pixels close to the background colour and makes them transparent
export async function cutout(input) {
  let img = sharp(input).rotate().ensureAlpha();
  const meta = await img.metadata();
  const maxSide = 1600;
  if (Math.max(meta.width, meta.height) > maxSide) img = img.resize({ width: meta.width >= meta.height ? maxSide : null, height: meta.height > meta.width ? maxSide : null });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent++;
  if (transparent / (w * h) < 0.02) { // no usable alpha: strip the (near-uniform) background
    const px = (x, y) => { const o = (y * w + x) * 4; return [data[o], data[o + 1], data[o + 2]]; };
    const samples = [];
    for (let i = 0; i < 12; i++) { const t = Math.floor((i / 11) * (w - 1)); samples.push(px(t, 0), px(t, h - 1)); const v = Math.floor((i / 11) * (h - 1)); samples.push(px(0, v), px(w - 1, v)); }
    const med = [0, 1, 2].map((c) => samples.map((s) => s[c]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]);
    const tol = 34;
    const dist = (o) => Math.abs(data[o] - med[0]) + Math.abs(data[o + 1] - med[1]) + Math.abs(data[o + 2] - med[2]);
    // a pixel joins the background if it is near the backdrop colour, or if it is a smooth continuation of a neighbour that
    // already did (soft floor shadows) and still fairly light - the can's sharp edge stops the fill
    const canEnter = (o, po) => {
      const d = dist(o);
      if (d < tol * 3) return true;
      if (po < 0 || d > 340) return false;
      return Math.abs(data[o] - data[po]) + Math.abs(data[o + 1] - data[po + 1]) + Math.abs(data[o + 2] - data[po + 2]) <= 30;
    };
    const bgMask = new Uint8Array(w * h), stack = [];
    const push = (x, y, px, py) => { const i = y * w + x; if (!bgMask[i] && canEnter(i * 4, px < 0 ? -1 : (py * w + px) * 4)) { bgMask[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x, 0, -1, -1); push(x, h - 1, -1, -1); }
    for (let y = 0; y < h; y++) { push(0, y, -1, -1); push(w - 1, y, -1, -1); }
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      if (x > 0) push(x - 1, y, x, y); if (x < w - 1) push(x + 1, y, x, y); if (y > 0) push(x, y - 1, x, y); if (y < h - 1) push(x, y + 1, x, y);
    }
    const alpha = Buffer.alloc(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = bgMask[i] ? 0 : 255;
    // soften the cut edge by one pixel so it blends instead of looking jagged
    const soft = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(1.1).threshold(110).blur(0.8).raw().toBuffer({ resolveWithObject: true });
    const stride = soft.info.channels; // threshold() may hand back 3 identical channels
    for (let i = 0; i < w * h; i++) data[i * 4 + 3] = soft.data[i * stride];
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 6 }).png().toBuffer();
}

// centres the cutout on a transparent canvas, height-fitted
export async function frame(png, W, H, fill = 0.92) {
  const t = await sharp(png).resize({ width: Math.round(W * 0.92), height: Math.round(H * fill), fit: 'inside' }).toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: t.data, left: Math.round((W - t.info.width) / 2), top: Math.round((H - t.info.height) / 2) }]).png().toBuffer();
}

// n cans in staggered rows (back rows smaller + a touch darker, soft contact shadows) built from one cutout
export async function packFromCutout(png, n) {
  const [cols, rows] = { 6: [3, 2], 12: [4, 3], 24: [6, 4] }[n];
  const base = await sharp(png).resize({ height: 520 }).toBuffer({ resolveWithObject: true });
  const cw = base.info.width, ch = base.info.height;
  const W = 1800, H = 1300, comps = [];
  const shadow = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw * 2}" height="${Math.round(cw * 0.7)}"><ellipse cx="${cw}" cy="${cw * 0.35}" rx="${cw * 0.8}" ry="${cw * 0.2}" fill="rgba(0,0,0,.34)"/></svg>`)).blur(8).png().toBuffer();
  for (let r = 0; r < rows; r++) { // r = 0 is the back row, drawn first
    const depth = rows - 1 - r; // 0 = front
    const k = 1 - 0.06 * depth;
    const img = await sharp(base.data).resize({ height: Math.round(ch * k) }).modulate({ brightness: 1 - 0.07 * depth }).toBuffer({ resolveWithObject: true });
    const y = H * 0.8 - img.info.height - depth * ch * 0.2;
    for (let c = 0; c < cols; c++) {
      const x = W / 2 + (c - (cols - 1) / 2) * cw * 1.04 * k + (r % 2 ? cw * 0.28 : -cw * 0.28) - img.info.width / 2;
      const sh = await sharp(shadow).resize({ width: Math.round(cw * 1.9 * k) }).toBuffer({ resolveWithObject: true });
      comps.push({ input: sh.data, left: Math.round(x + img.info.width / 2 - sh.info.width / 2 + cw * 0.1), top: Math.round(y + img.info.height - sh.info.height * 0.5) });
      comps.push({ input: img.data, left: Math.round(x), top: Math.round(Math.max(0, y)) });
    }
  }
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toBuffer();
}
