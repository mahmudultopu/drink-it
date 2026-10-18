// Illustrated lifestyle scenes (hero panels, blog thumbnails, banners) built from the can art.
import { canGroup, geometry } from './can.mjs';
import { icon } from './icons.mjs';
import { svgDoc, num, rng, lighten, darken, mix } from './lib.mjs';

function cansDefs(specs, droplets = 22) {
  // each can gets its own id so gradients do not collide
  let defs = '';
  const geoms = [];
  specs.forEach((s, i) => {
    const c = canGroup({ ...s, droplets: s.droplets ?? droplets }, `k${i}`);
    defs += c.defs + c.content;
    geoms.push(c.geom);
  });
  return { defs, geoms };
}

/** Place can i standing on baseline y (bottom centre at x,y), leaning by `rot` degrees about its base. */
const stand = (i, x, y, scale, rot, geom) =>
  `<g transform="translate(${num(x)} ${num(y)}) rotate(${num(rot)}) scale(${num(scale)}) translate(0 ${num(-geom.base - 6)})"><use href="#k${i}"/></g>`;

const ice = (x, y, s, rot, o = 1) =>
  `<g transform="translate(${num(x)} ${num(y)}) rotate(${rot})" opacity="${o}"><rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${num(s * 0.2)}" fill="#fff" fill-opacity=".42" stroke="#fff" stroke-opacity=".95" stroke-width="${num(Math.max(2, s * 0.04))}"/><path d="M${num(-s * 0.3)} ${num(-s * 0.16)} L${num(-s * 0.12)} ${num(-s * 0.3)}" stroke="#fff" stroke-width="${num(Math.max(3, s * 0.07))}" stroke-linecap="round"/><path d="M${num(-s * 0.3)} ${num(s * 0.12)} L${num(-s * 0.3)} ${num(s * 0.02)}" stroke="#fff" stroke-width="${num(Math.max(3, s * 0.06))}" stroke-linecap="round"/></g>`;

const bubble = (x, y, r, o = 0.9) => `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="#fff" fill-opacity=".16" stroke="#fff" stroke-opacity="${o}" stroke-width="${num(Math.max(2, r * 0.12))}"/><circle cx="${num(x - r * 0.35)}" cy="${num(y - r * 0.35)}" r="${num(r * 0.18)}" fill="#fff" fill-opacity="${o}"/>`;

function splash(cx, cy, count, len, fill, seed = 3) {
  const R = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const ang = -80 + (160 * i) / (count - 1) + (R() - 0.5) * 8;
    const L = len * (0.5 + R() * 0.75);
    out += `<g transform="translate(${num(cx)} ${num(cy)}) rotate(${num(ang)}) scale(${num(L / 42)})"><path d="M0 0 C 7 -10 8 -26 0 -42 C -8 -26 -7 -10 0 0 Z" fill="${fill}" fill-opacity="${num(0.55 + R() * 0.4)}"/></g>`;
  }
  return out;
}

function wavyFloor(w, y, color, amp = 14, seed = 2) {
  const R = rng(seed);
  const pts = [];
  for (let x = -20; x <= w + 20; x += 40) pts.push([x, y + Math.sin(x / 90) * amp + (R() - 0.5) * 6]);
  let d = `M${pts[0][0]} ${num(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [x, yy] = pts[i];
    d += ` Q${num((px + x) / 2)} ${num(py - amp * 0.5)} ${x} ${num(yy)}`;
  }
  return `<path d="${d} L${w + 20} 3000 L-20 3000 Z" fill="${color}"/>`;
}

// ---------- hero panel scenes ----------
export function heroScene(specs, { bg1 = '#E9F7D8', bg2 = '#CFEBA2', sun = '#F7FFE6', floor = '#BFE67A', slices = ['lime', 'lemon', 'orange'], w = 1128, h = 1210, seed = 4 } = {}) {
  const { defs, geoms } = cansDefs(specs, 26);
  const base = h * 0.9;
  const sc = (h * 0.62) / geoms[0].height; // centre can height ≈ 62% of the panel
  // back-to-front order
  const layout = [
    { i: 3, x: w * 0.13, y: base - 8, s: sc * 0.7, r: -16 },
    { i: 4, x: w * 0.87, y: base - 4, s: sc * 0.7, r: 15 },
    { i: 1, x: w * 0.27, y: base + 10, s: sc * 0.84, r: -8 },
    { i: 2, x: w * 0.73, y: base + 12, s: sc * 0.84, r: 7 },
    { i: 0, x: w * 0.5, y: base + 30, s: sc, r: 0 },
  ].filter((l) => specs[l.i]);
  const R = rng(seed);
  let iceBack = '';
  for (let i = 0; i < 8; i++) iceBack += ice(w * (0.06 + R() * 0.88), h * (0.78 + R() * 0.12), 70 + R() * 80, num(R() * 70 - 35), 0.9);
  let iceFront = '';
  for (let i = 0; i < 3; i++) iceFront += ice(w * (0.15 + R() * 0.7), h * (0.93 + R() * 0.05), 60 + R() * 50, num(R() * 50 - 25), 0.95);
  let bubbles = '';
  for (let i = 0; i < 18; i++) bubbles += bubble(w * (0.05 + R() * 0.9), h * (0.06 + R() * 0.62), 8 + R() * 28);
  let fruit = '';
  slices.forEach((n, k) => {
    const pos = [[0.13, 0.2, 3.8], [0.87, 0.16, 3.3], [0.84, 0.5, 2.6]][k] || [0.5, 0.2, 2.4];
    fruit += `<g transform="translate(${num(w * pos[0])} ${num(h * pos[1])}) scale(${pos[2]}) rotate(${k * 25})">${icon(n, {})}</g>`;
  });
  const body = `
<defs>${defs}
<linearGradient id="hbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
<radialGradient id="hsun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${sun}" stop-opacity="1"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#hbg)"/>
<circle cx="${w * 0.5}" cy="${h * 0.4}" r="${w * 0.62}" fill="url(#hsun)"/>
${bubbles}
${fruit}
${wavyFloor(w, h * 0.84, floor, 16, seed)}
${wavyFloor(w, h * 0.92, lighten(floor, 0.35), 12, seed + 3)}
${splash(w * 0.5, h * 0.9, 17, 170, '#fff', seed)}
${iceBack}
${layout.map((l) => stand(l.i, l.x, l.y, l.s, l.r, geoms[l.i])).join('')}
${iceFront}`;
  return svgDoc([0, 0, w, h], body, { width: w, height: h, par: 'xMidYMid slice', title: 'Ice cold cans with splash' });
}

// ---------- row-of-cans scenes (blog thumbs, banners, about) ----------
export function rowScene(specs, { bg = '#FFA977', stripe = '#FFC2A0', w = 960, h = 600, seed = 5, fill = 0.78, crop = 0.02, overlap = 0.96, shadow = true } = {}) {
  const { defs, geoms } = cansDefs(specs, 20);
  const n = specs.length;
  const R = rng(seed);
  // base scale from the tallest can so they fill `fill` of the height
  const sMid = (h * fill) / geoms[0].height;
  // widths of each can at its scale; centre can is slightly bigger
  const scales = specs.map((_, i) => sMid * (i === Math.floor((n - 1) / 2) ? 1.12 : 1));
  const widths = specs.map((_, i) => 2 * geoms[i].W * scales[i]);
  let total = widths.reduce((a, b) => a + b, 0) * overlap;
  const k = total > w * 1.04 ? (w * 1.04) / total : 1; // shrink if too wide
  total *= k;
  let x = (w - total) / 2;
  const baseY = h * (1 - crop);
  const placed = specs.map((_, i) => {
    const sw = widths[i] * k * overlap;
    const cx = x + (widths[i] * k) / 2;
    x += sw;
    return stand(i, cx, baseY + (i % 2 ? 6 : 0), scales[i] * k, (R() - 0.5) * 6, geoms[i]);
  });
  let stripes = '';
  for (let i = 0; i < 7; i++) stripes += `<path d="M${-120 + i * (w / 5)} ${h} L${40 + i * (w / 5)} 0 L${40 + w / 14 + i * (w / 5)} 0 L${-120 + w / 14 + i * (w / 5)} ${h} Z" fill="${stripe}" fill-opacity=".38"/>`;
  const sh = shadow ? `<ellipse cx="${w / 2}" cy="${num(baseY + 4)}" rx="${num(total * 0.52)}" ry="${num(h * 0.035)}" fill="#000" fill-opacity=".16"/>` : '';
  const body = `<defs>${defs}</defs><rect width="${w}" height="${h}" fill="${bg}"/>${stripes}${sh}${placed.join('')}`;
  return svgDoc([0, 0, w, h], body, { width: w, height: h, par: 'xMidYMid slice' });
}

// ---------- wide pop-art strip scene for the vertical-stripes "video" section ----------
export function stripsScene(specs, { w = 2800, h = 1080 } = {}) {
  const { defs, geoms } = cansDefs(specs, 30);
  let dots = '';
  for (let y = 0; y < h; y += 46) for (let x = (y / 46) % 2 ? 0 : 23; x < w; x += 46) dots += `<circle cx="${x}" cy="${y}" r="${num(6 + 8 * Math.abs(Math.sin(x / 260 + y / 330)))}" fill="#fff" fill-opacity=".35"/>`;
  const cols = ['#FFC800', '#F2398A', '#12A4E0', '#E8301F', '#1BA05A'];
  let blocks = '';
  for (let i = 0; i < 5; i++) blocks += `<rect x="${i * (w / 5)}" y="0" width="${w / 5 + 2}" height="${h}" fill="${cols[i % cols.length]}"/>`;
  const s = (h * 1.15) / geoms[0].height;
  const canPos = specs.map((_, i) => stand(i, w * (0.1 + (i / Math.max(1, specs.length - 1)) * 0.8), h * 1.02, s, (i - 2) * 9, geoms[i]));
  const body = `<defs>${defs}</defs>${blocks}<g>${dots}</g>${canPos.join('')}`;
  return svgDoc([0, 0, w, h], body, { width: w, height: h, par: 'xMidYMid slice' });
}

export { geometry };
