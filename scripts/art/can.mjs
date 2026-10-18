// Vector can renderer: aluminium rims, shaded cylindrical body, flat label art, outlined text.
// Produces self-contained SVG (no external fonts), so images work inside <img> tags.
import { textNode, textWidth, textPath, fitText, KS, mix, lighten, darken, num, svgDoc, rng, hashSeed } from './lib.mjs';
import { icon } from './icons.mjs';

const KINDS = {
  std: { W: 70, H: 178 },
  slim: { W: 58, H: 198 },
  tall: { W: 76, H: 214 },
};

export function geometry(kind = 'std') {
  const { W, H } = KINDS[kind] || KINDS.std;
  const lidR = W - 8;
  const top = 12;
  const shoulder = 46;
  const bodyBottom = shoulder + H;
  const base = bodyBottom + 20;
  return { W, H, lidR, top, shoulder, bodyBottom, base, height: base + 12 };
}

/** Catmull-Rom â†’ cubic bezier smooth path through points. */
function smooth(points) {
  let d = `M${num(points[0][0])} ${num(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${num(c1[0])} ${num(c1[1])} ${num(c2[0])} ${num(c2[1])} ${num(p2[0])} ${num(p2[1])}`;
  }
  return d;
}

function ribbon(W, y, thickness, amp, phase = 0) {
  const top = [], bot = [];
  for (let x = -W - 12; x <= W + 12; x += 14) {
    const yy = y + amp * Math.sin((x / W) * Math.PI * 1.15 + phase);
    top.push([x, yy]);
    bot.push([x, yy + thickness]);
  }
  const t = smooth(top);
  const b = smooth(bot.reverse());
  return `${t} L${num(bot[0][0])} ${num(bot[0][1])} ${b.slice(b.indexOf('C'))} Z`.replace(/^M/, 'M');
}

function splitWords(text, font, size, maxW) {
  const w = textWidth(font, text, size);
  if (w <= maxW || !text.includes(' ')) return [text];
  const words = text.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const m = Math.max(textWidth(font, a, size), textWidth(font, b, size));
    if (!best || m < best.m) best = { lines: [a, b], m };
  }
  return best.lines;
}

/**
 * Build one can as a <g id> plus its <defs>. Origin (0,0) is horizontally centred at the very top.
 * spec: { brand, font, variant, size, kind, body, body2, ink, accent, icon, iconProps, band,
 *         tagline, badge, tilt, wordScale, droplets }
 */
export function canGroup(spec, id) {
  const g = geometry(spec.kind);
  const { W, H, lidR, top, shoulder, bodyBottom, base } = g;
  const s = W / 70; // type scale relative to the standard can
  const body = spec.body, body2 = spec.body2 || darken(body, 0.2);
  const ink = spec.ink || '#ffffff';
  const accent = spec.accent || lighten(body, 0.55);
  const wf = spec.font || 'Poppins-ExtraBold';

  const sil = [
    `M${-lidR} ${top}`,
    `C${-lidR} ${top + 18} ${-W} ${shoulder - 12} ${-W} ${shoulder}`,
    `L${-W} ${bodyBottom}`,
    `C${-W} ${bodyBottom + 9} ${-W + 9} ${base - 7} ${-W + 18} ${base}`,
    `Q0 ${base + 8} ${W - 18} ${base}`,
    `C${W - 9} ${base - 7} ${W} ${bodyBottom + 9} ${W} ${bodyBottom}`,
    `L${W} ${shoulder}`,
    `C${W} ${shoulder - 12} ${lidR} ${top + 18} ${lidR} ${top}`,
    'Z',
  ].join(' ');
  const label = `M${-W} ${shoulder} Q0 ${shoulder + 6} ${W} ${shoulder} L${W} ${bodyBottom} Q0 ${bodyBottom + 8} ${-W} ${bodyBottom} Z`;

  const defs = `
<linearGradient id="${id}-metal" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#868990"/><stop offset=".2" stop-color="#F4F5F7"/><stop offset=".48" stop-color="#B9BCC2"/><stop offset=".78" stop-color="#E6E8EB"/><stop offset="1" stop-color="#777A82"/></linearGradient>
<linearGradient id="${id}-lid" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#FAFBFC"/><stop offset=".55" stop-color="#C9CCD1"/><stop offset="1" stop-color="#9FA3AA"/></linearGradient>
<linearGradient id="${id}-shade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".09" stop-color="#000" stop-opacity=".12"/><stop offset=".27" stop-color="#fff" stop-opacity=".36"/><stop offset=".4" stop-color="#fff" stop-opacity=".07"/><stop offset=".72" stop-color="#000" stop-opacity=".05"/><stop offset=".92" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
<linearGradient id="${id}-body" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${body}"/><stop offset="1" stop-color="${body2}"/></linearGradient>
<radialGradient id="${id}-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${accent}" stop-opacity=".55"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}-drop" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".45" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></radialGradient>
<clipPath id="${id}-label"><path d="${label}"/></clipPath>
<filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>`;

  // ----- label art -----
  let art = '';
  const yMid = shoulder + H * 0.5;
  // soft glow behind emblem
  art += `<ellipse cx="0" cy="${num(shoulder + H * 0.5)}" rx="${num(W * 0.95)}" ry="${num(H * 0.28)}" fill="url(#${id}-glow)"/>`;
  const band = spec.band || 'wave';
  if (band === 'wave') {
    art += `<path d="${ribbon(W, shoulder + H * 0.62, 22 * s, 9, 0.6)}" fill="${accent}" fill-opacity=".30"/>`;
    art += `<path d="${ribbon(W, shoulder + H * 0.62 + 30 * s, 6 * s, 9, 0.6)}" fill="${accent}" fill-opacity=".45"/>`;
  } else if (band === 'stripe') {
    art += `<rect x="${-W - 4}" y="${num(shoulder + H * 0.64)}" width="${2 * W + 8}" height="${num(7 * s)}" fill="${accent}" fill-opacity=".55"/><rect x="${-W - 4}" y="${num(shoulder + H * 0.64 + 11 * s)}" width="${2 * W + 8}" height="${num(2.4 * s)}" fill="${accent}" fill-opacity=".55"/>`;
  } else if (band === 'dots') {
    const R = rng(hashSeed(spec.brand + (spec.variant || '')));
    let dots = '';
    for (let i = 0; i < 46; i++) {
      const x = -W + R() * 2 * W, y = shoulder + R() * H;
      const edge = Math.min(1, Math.hypot(x / W, (y - yMid) / (H / 2)));
      if (edge < 0.62) continue;
      dots += `<circle cx="${num(x)}" cy="${num(y)}" r="${num((1.6 + R() * 3) * s)}" fill="${accent}" fill-opacity="${num(0.2 + R() * 0.25)}"/>`;
    }
    art += dots;
  } else if (band === 'slash') {
    art += `<path d="M${-W - 6} ${num(shoulder + H * 0.78)} L${W + 6} ${num(shoulder + H * 0.5)} L${W + 6} ${num(shoulder + H * 0.62)} L${-W - 6} ${num(shoulder + H * 0.9)} Z" fill="${accent}" fill-opacity=".34"/>`;
  }

  // running tagline (wraps around the can, so it overflows on purpose)
  const tag = spec.tagline || (W < 64 ? 'ICE COLD  •  REFRESHING  •  ICE COLD' : 'ICE COLD  •  REFRESHING  •  ICE COLD  •');
  if (!spec.lite) art += textNode('Poppins-SemiBold', tag, { cx: 0, y: shoulder + 17 * s, size: 6.2 * s, letterSpacing: 1.5 * s, fill: ink, opacity: 0.78 });

  // ---- flow layout: wordmark -> icon -> variant name -> bottom row ----
  const by = bodyBottom - 11 * s; // baseline of the bottom info row
  const wmMax = 2 * W - 16 * s;
  let wmSize = 30 * s * (spec.wordScale || 1);
  let lines = splitWords(spec.brand, wf, wmSize, wmMax);
  if (lines.length > 1) { wmSize *= 0.84; lines = splitWords(spec.brand, wf, wmSize, wmMax); }
  const lineH = wmSize * 0.94;
  const capH = wmSize * 0.72;
  const tilt = spec.tilt ?? -6;
  const vSize = 15.5 * s;
  const vl = spec.variant && !spec.lite ? splitWords(spec.variant, 'YoungSerif-Regular', vSize, 2 * W - 20 * s) : [];
  const vH = vl.length ? vl.length * vSize * 1.05 : 0;
  const rowTop = by - 14 * s;
  const hasIcon = spec.icon && spec.icon !== 'none';

  // pass 1 measures, pass 2 re-runs with a vertical offset so content sits centred in the label
  let wmDefs = '';
  const flow = (off) => {
    let out = '';
    const wmTop = shoulder + 27 * s + off; // clear of the running tagline
    let wm = '';
    let yLast = 0;
    wmDefs = '';
    lines.forEach((ln, i) => {
      const y = wmTop + capH + i * lineH;
      yLast = y;
      // outline once, draw twice (soft shadow + main) via <use> to keep files small
      const t = fitText(wf, ln, { size: wmSize, maxW: wmMax });
      const x = num(-t.width / 2);
      wmDefs += `<path id="${id}-w${i}" d="${t.d}"/>`;
      wm += `<use href="#${id}-w${i}" transform="translate(${x} ${num(y + 1.8)}) scale(${KS})" fill="${darken(body, 0.35)}" fill-opacity=".55"/>`;
      wm += `<use href="#${id}-w${i}" transform="translate(${x} ${num(y)}) scale(${KS})" fill="${ink}"/>`;
    });
    out += `<g transform="rotate(${tilt} 0 ${num(wmTop + capH * 0.5)})">${wm}</g>`;
    const gapTop = yLast + 7 * s;
    const avail = rowTop - vH - gapTop - 3 * s;
    const iconR = hasIcon ? Math.max(12 * s, Math.min(29 * s * (spec.iconScale || 1), avail / 2)) : 0;
    const iy = gapTop + 1 * s + iconR;
    if (hasIcon) {
      const disc = spec.disc !== false && ['cola', 'bolt', 'zero', 'snow', 'cap', 'ice'].includes(spec.icon);
      out += `<g transform="translate(0 ${num(iy)}) scale(${num(iconR / 29)})">${disc ? `<circle r="29" fill="${ink}" fill-opacity=".14"/><circle r="29" fill="none" stroke="${ink}" stroke-opacity=".55" stroke-width="1.6"/>` : ''}${icon(spec.icon, { ink, accent, ...(spec.iconProps || {}) })}</g>`;
    }
    let bottom = hasIcon ? iy + iconR : gapTop;
    if (vl.length) {
      const vy0 = (hasIcon ? iy + iconR : gapTop + 6 * s) + 4 * s + vSize * 0.78;
      vl.forEach((ln, i) => {
        out += textNode('YoungSerif-Regular', ln, { cx: 0, y: vy0 + i * vSize * 1.05, size: vSize, maxW: 2 * W - 20 * s, fill: ink });
      });
      bottom = vy0 + (vl.length - 1) * vSize * 1.05 + vSize * 0.25;
    }
    return { out, bottom };
  };
  const first = flow(0);
  const spare = rowTop - 2 * s - first.bottom;
  art += flow(Math.max(0, Math.min(spare * 0.5, 24 * s))).out;

  // bottom row: size  | tagline | badge
  const sz = spec.lite ? '' : spec.size || '';
  if (sz) {
    const [n, unit] = sz.split(' ');
    const nw = textWidth('Poppins-Bold', n, 9.4 * s);
    art += `<path d="${textPath('Poppins-Bold', n, 9.4 * s).d}" transform="translate(${num(-W + 13 * s)} ${num(by)}) scale(${KS})" fill="${ink}"/>`;
    art += `<path d="${textPath('Poppins-SemiBold', unit || '', 5.4 * s).d}" transform="translate(${num(-W + 13 * s + nw / 2 - textWidth('Poppins-SemiBold', unit || '', 5.4 * s) / 2)} ${num(by + 7 * s)}) scale(${KS})" fill="${ink}" fill-opacity=".85"/>`;
  }
  if (spec.badge && !spec.lite) {
    const [b1, b2] = Array.isArray(spec.badge) ? spec.badge : [spec.badge, ''];
    const bw = Math.max(textWidth('Poppins-Bold', b1, 6.6 * s), textWidth('Poppins-SemiBold', b2, 5.2 * s));
    const bx = W - 13 * s - bw / 2;
    art += textNode('Poppins-Bold', b1, { cx: bx, y: by - (b2 ? 1 : 0), size: 6.6 * s, fill: ink });
    if (b2) art += textNode('Poppins-SemiBold', b2, { cx: bx, y: by + 6.4 * s, size: 5.2 * s, fill: ink, opacity: 0.85 });
  }
  if (spec.kind !== 'slim' && spec.center !== false && !spec.lite) {
    art += textNode('Poppins-SemiBold', spec.center || 'Best served', { cx: 0, y: by - 1, size: 5.6 * s, fill: ink, opacity: 0.85 });
    art += textNode('Poppins-SemiBold', spec.center2 || 'ice cold', { cx: 0, y: by + 6, size: 5.6 * s, fill: ink, opacity: 0.85 });
  }

  // condensation droplets
  let drops = '';
  if (spec.droplets) {
    const R = rng(hashSeed('d' + spec.brand + (spec.variant || '')));
    for (let i = 0; i < spec.droplets; i++) {
      const x = -W + 8 + R() * (2 * W - 16), y = shoulder + 10 + R() * (H - 20), r = 1.1 + R() * 3.1;
      drops += `<ellipse cx="${num(x)}" cy="${num(y)}" rx="${num(r)}" ry="${num(r * 1.18)}" fill="url(#${id}-drop)"/><ellipse cx="${num(x + r * 0.3)}" cy="${num(y + r * 0.9)}" rx="${num(r * 0.8)}" ry="${num(r * 0.3)}" fill="#000" fill-opacity=".10"/>`;
    }
  }

  const content = `
<g id="${id}">
  <path d="${sil}" fill="url(#${id}-metal)"/>
  <g clip-path="url(#${id}-label)">
    <rect x="${-W - 2}" y="${shoulder - 2}" width="${2 * W + 4}" height="${H + 14}" fill="url(#${id}-body)"/>
    ${art}
  </g>
  <ellipse cx="0" cy="${top}" rx="${lidR}" ry="7" fill="url(#${id}-lid)"/>
  <ellipse cx="0" cy="${top + 0.4}" rx="${lidR - 6}" ry="4.3" fill="#B7BAC0"/>
  <ellipse cx="0" cy="${top + 0.8}" rx="${lidR - 7}" ry="3.6" fill="#D5D7DB"/>
  <rect x="-13" y="${top - 4.2}" width="26" height="7.6" rx="3.8" fill="#EEEFF1" stroke="#8C8F96" stroke-width=".8"/>
  <ellipse cx="0" cy="${top - 0.4}" rx="4.4" ry="1.7" fill="#9DA0A7"/>
  <path d="${sil}" fill="url(#${id}-shade)"/>
  <rect x="${-W + 15}" y="${shoulder + 14}" width="${num(6 * s)}" height="${num(H - 30)}" rx="${num(3 * s)}" fill="#fff" fill-opacity=".32" filter="url(#${id}-soft)"/>
  ${drops}
</g>`;
  return { defs: defs + wmDefs, content, geom: g, tile: spec.tile };
}

/** Standalone single-can SVG. */
export function canSvg(spec, { shadow = true, title } = {}) {
  const id = 'c';
  const { defs, content, geom } = canGroup(spec, id);
  const pad = 14;
  const vb = [-geom.W - pad, 0, 2 * (geom.W + pad), geom.height + 14];
  const sh = shadow ? `<ellipse cx="0" cy="${geom.base + 5}" rx="${geom.W - 8}" ry="6.5" fill="#000" fill-opacity=".16" filter="url(#${id}-soft)"/>` : '';
  return svgDoc(vb, `<defs>${defs}</defs>${sh}${content}`, { title: title || `${spec.brand} ${spec.variant || ''}`.trim() });
}

/** Tilted can with condensation, used as the 2nd gallery image and hover image. */
export function canAngleSvg(spec, { title } = {}) {
  const s2 = { ...spec, droplets: spec.droplets || 34 };
  const { defs, content, geom } = canGroup(s2, 'c');
  const cy = geom.height / 2;
  const vb = [-150, -40, 300, 360];
  return svgDoc(vb, `<defs>${defs}</defs><g transform="translate(0 ${num(10)}) rotate(18 0 ${num(cy)})">${content}</g>`, { title: title || `${spec.brand} ${spec.variant || ''}`.trim() });
}

/** Rounded "pill" badge used on pack images (matches the theme's lime pill with a teal drop edge). */
function packBadge(text, x, y) {
  const w = textWidth('Poppins-ExtraBold', text, 17) + 30;
  return `<g transform="translate(${x} ${y})"><rect x="${num(-w / 2 + 2)}" y="-14" width="${num(w)}" height="38" rx="19" fill="#004D51"/><rect x="${num(-w / 2)}" y="-18" width="${num(w)}" height="38" rx="19" fill="#E0FA63" stroke="#004D51" stroke-width="2.5"/>${textNode('Poppins-ExtraBold', text, { cx: 0, y: 7.5, size: 17, fill: '#11704B' })}</g>`;
}

/** Cardboard tray (12 / 24 packs): kraft front panel with cans behind. */
function tray(rows, cols, label, spec, kind) {
  const id = 'c';
  const { defs, content, geom } = canGroup({ ...spec, lite: true }, id);
  const W2 = geom.W * 2;
  const parts = [];
  const totalW = cols * (W2 - 6);
  const startX = -totalW / 2 + (W2 - 6) / 2;
  const kraft = '#C79B63', kraftDark = '#A57B45';
  const rowsDraw = Math.min(rows, 3);
  for (let r = rowsDraw - 1; r >= 0; r--) {
    const k = 1 - r * 0.07;
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (W2 - 6) * k + (r % 2 ? (W2 - 6) * 0.25 : 0);
      parts.push(`<use href="#${id}" transform="translate(${num(x)} ${num(8 + r * -12 + 0)}) scale(${num(k)})"/>`);
    }
  }
  const panelY = geom.height * 0.58;
  const panelW = totalW + 26, panelH = geom.height * 0.5;
  const panel = `<g><rect x="${num(-panelW / 2)}" y="${num(panelY)}" width="${num(panelW)}" height="${num(panelH)}" rx="10" fill="${kraft}"/>
    <rect x="${num(-panelW / 2)}" y="${num(panelY)}" width="${num(panelW)}" height="14" rx="7" fill="${kraftDark}" fill-opacity=".55"/>
    <path d="M${num(-panelW / 2 + 12)} ${num(panelY + 30)} H${num(panelW / 2 - 12)}" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-dasharray="3 7"/>
    ${textNode('Poppins-ExtraBold', label, { cx: 0, y: panelY + 74, size: 44, fill: '#5A3A12', opacity: 0.9 })}
    ${textNode('Poppins-SemiBold', `${(spec.brand + ' ' + (spec.variant || '')).toUpperCase().trim()}`, { cx: 0, y: panelY + 98, size: 12, maxW: panelW - 40, letterSpacing: 2, fill: '#5A3A12', opacity: 0.8 })}</g>`;
  const vbW = panelW + 40;
  const vb = [-vbW / 2, -10, vbW, panelY + panelH + 24];
  return { svg: svgDoc(vb, `<defs>${defs}${content}</defs>${parts.join('')}${panel}`, { title: `${label} ${spec.brand}` }), vb };
}

/** 6-pack shrink-wrapped: two rows of three. */
export function pack6Svg(spec) {
  const { defs, content, geom } = canGroup({ ...spec, lite: true }, 'c');
  const dx = geom.W * 2 - 8;
  const back = [-0.5, 0.5].map((i) => `<use href="#c" transform="translate(${num(i * dx)} 0) scale(.96)"/>`).join('');
  const front = [-1, 0, 1].map((i) => `<use href="#c" transform="translate(${num(i * dx)} ${num(54)}) "/>`).join('');
  const vbW = dx * 3 + 40;
  const H = geom.height + 54 + 20;
  // translucent wrap bands
  const wrap = `<rect x="${num(-dx * 1.5 - 4)}" y="${num(geom.shoulder + 44)}" width="${num(dx * 3 + 8)}" height="12" rx="6" fill="#fff" fill-opacity=".22" stroke="#fff" stroke-opacity=".5"/>`;
  return svgDoc([-vbW / 2, 0, vbW, H], `<defs>${defs}${content}</defs>${back}${front}${wrap}${packBadge('6 CANS', num(dx * 1.05), H - 34)}`, { title: `6 pack ${spec.brand} ${spec.variant || ''}` });
}

export function pack12Svg(spec) {
  return tray(2, 4, '12', spec).svg;
}
export function pack24Svg(spec) {
  return tray(3, 6, '24', spec).svg;
}

