// Decorative vector shapes: torn-paper edge, hill dividers, wave dividers, badges, logo, fruit stickers.
import { font, textPath, fitText, KS, num, rng, svgDoc, hex2rgb, lighten, darken } from './lib.mjs';
import { icon } from './icons.mjs';

const PALETTE = { green: '#11704B', lime: '#E0FA63', limeText: '#DAF45B', teal: '#004D51', brown: '#200D07', crimson: '#DE114A', hillLime: '#D9F35B', hillMid: '#64B74C' };
export { PALETTE };

/** Smooth path through points (Catmull-Rom to cubic Bezier). */
function smooth(points, close = false) {
  let d = `M${num(points[0][0])} ${num(points[0][1])}`;
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${num(c1[0])} ${num(c1[1])} ${num(c2[0])} ${num(c2[1])} ${num(p2[0])} ${num(p2[1])}`;
  }
  return d;
}

/** Seamlessly tiling torn-paper strip: ragged top edge, solid below. Used as a CSS mask. */
export function tornEdgeSvg({ width = 1440, height = 48, seed = 7 } = {}) {
  const R = rng(seed);
  const pts = [];
  let x = 0;
  const base = height * 0.5;
  while (x < width) {
    const lf = Math.sin((x / width) * Math.PI * 2 * 9 + 1.1) * 6.5 + Math.sin((x / width) * Math.PI * 2 * 23 + 0.4) * 3.2;
    const hf = (R() - 0.5) * 9;
    pts.push([x, base + lf + hf]);
    x += 3 + R() * 7;
  }
  pts.push([width, pts[0][1]]);
  const d = `M0 ${height} L${pts.map((p) => `${num(p[0])} ${num(p[1])}`).join(' L')} L${width} ${height} Z`;
  return svgDoc([0, 0, width, height], `<path d="${d}" fill="#000"/>`, { width, height });
}

/** Shallow wave: solid fill UNDER a smooth curve (mask for a section's rounded-wave bottom). */
export function waveSvg() {
  const d = 'M0 66 C150 24 330 4 520 14 S 860 66 1030 74 S 1330 52 1440 26 L1440 100 L0 100 Z';
  return svgDoc([0, 0, 1440, 100], `<path d="${d}" fill="#000"/>`, { width: 1440, height: 100, par: 'none' });
}

function ridge(points, { jitter = 2.6, step = 7, seed = 1 } = {}) {
  // sample the smooth ridge densely, then add little jagged jitter for the torn look
  const R = rng(seed);
  const pathPts = [];
  const xs = points.map((p) => p[0]);
  const lerp = (a, b, t) => a + (b - a) * t;
  // piecewise cosine interpolation (smooth hills)
  const xEnd = xs[xs.length - 1];
  for (let x = xs[0]; x < xEnd + step; x += step) {
    const xx = Math.min(x, xEnd); // always land exactly on the last point
    let i = 0;
    while (i < points.length - 2 && xx > points[i + 1][0]) i++;
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const t = (xx - x0) / (x1 - x0);
    const tt = (1 - Math.cos(Math.PI * t)) / 2;
    pathPts.push([xx, lerp(y0, y1, tt) + (R() - 0.5) * jitter * 2]);
    if (xx === xEnd) break;
  }
  return pathPts;
}

/** Three overlapping hills (lime / mid green / deep green) like the reference theme's dividers. */
export function hillsSvg({ width = 1440, height = 280, deep = PALETTE.green, mid = PALETTE.hillMid, light = PALETTE.hillLime, seed = 3 } = {}) {
  const lime = ridge([[120, 214], [260, 168], [430, 128], [560, 96], [690, 30], [770, 24], [850, 56], [930, 110], [1010, 170], [1060, 280]], { seed: seed + 1 });
  const midP = ridge([[470, 280], [560, 214], [700, 190], [780, 150], [900, 44], [990, 52], [1090, 104], [1180, 168], [1260, 232], [1330, 280]], { seed: seed + 2 });
  const deepP = ridge([[0, 66], [90, 74], [200, 118], [330, 166], [440, 210], [540, 222], [650, 214], [760, 196], [850, 186], [940, 204], [1040, 224], [1140, 190], [1240, 132], [1340, 78], [1440, 56]], { seed: seed + 3, jitter: 3.2 });
  const poly = (pts, extra = '') => `M${pts.map((p) => `${num(p[0])} ${num(p[1])}`).join(' L')} ${extra} Z`;
  const body = `
<path d="${poly(lime, `L${lime[lime.length - 1][0]} ${height} L${lime[0][0]} ${height}`)}" fill="${light}"/>
<path d="${poly(midP, `L${midP[midP.length - 1][0]} ${height} L${midP[0][0]} ${height}`)}" fill="${mid}"/>
<path d="${poly(deepP, `L${width} ${height} L0 ${height}`)}" fill="${deep}"/>`;
  return svgDoc([0, 0, width, height], body, { width, height, par: 'none' });
}

/** Scalloped sticker with circular text and a centre icon. */
function scallop(cx, cy, r0, bumps, amp, steps = 220) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + (r0 + amp * Math.cos(bumps * a)) * Math.cos(a), cy + (r0 + amp * Math.cos(bumps * a)) * Math.sin(a)]);
  }
  return `M${pts.map((p) => `${num(p[0])} ${num(p[1])}`).join(' L')} Z`;
}

export function circleText(fontName, text, { r, size, letterSpacing = 0, start = -90, fill = '#fff' }) {
  const f = font(fontName);
  let total = 0;
  const glyphs = [...text].map((ch) => {
    const t = textPath(fontName, ch === ' ' ? ' ' : ch, size, { letterSpacing: 0 });
    const w = ch === ' ' ? size * 0.28 : t.width;
    total += w + letterSpacing;
    return { ch, t, w };
  });
  const arc = total / r; // radians used by the whole string
  let ang = (start * Math.PI) / 180 - arc / 2;
  let out = '';
  for (const g of glyphs) {
    const mid = ang + (g.w / 2 / r);
    const deg = (mid * 180) / Math.PI + 90;
    if (g.ch !== ' ') out += `<path d="${g.t.d}" transform="rotate(${num(deg)}) translate(${num(-g.w / 2)} ${num(-r)}) scale(${KS})" fill="${fill}"/>`;
    ang += (g.w + letterSpacing) / r;
  }
  return out;
}

/** Hero sticker: crimson scalloped badge with circular text and a lime heart/snowflake. */
export function badgeSvg({ text = 'ICE COLD • ICE COLD • ', body = PALETTE.crimson, shadow = PALETTE.teal, ink = '#fff', centre = 'snow' } = {}) {
  const c = 110;
  const inner = centre === 'heart'
    ? `<circle cx="${c}" cy="${c}" r="44" fill="${PALETTE.lime}"/><path d="M${c} ${c + 24} C ${c - 38} ${c - 2}, ${c - 22} ${c - 34}, ${c} ${c - 14} C ${c + 22} ${c - 34}, ${c + 38} ${c - 2}, ${c} ${c + 24} Z" fill="${body}"/>`
    : `<circle cx="${c}" cy="${c}" r="44" fill="${PALETTE.lime}"/><g transform="translate(${c} ${c}) scale(.95)">${icon('snow', { ink: body })}</g>`;
  const body_ = `
<g transform="translate(5 7)"><path d="${scallop(c, c, 100, 12, 6)}" fill="${shadow}"/></g>
<path d="${scallop(c, c, 100, 12, 6)}" fill="${body}"/>
<g transform="translate(${c} ${c})">${circleText('Poppins-ExtraBold', text, { r: 76, size: 14, letterSpacing: 2.2, fill: ink })}</g>
${inner}`;
  return svgDoc([0, 0, 226, 226], body_, { width: 226, height: 226, title: 'Ice cold sticker' });
}

/** Round "play" badge with rotating text (used on the video-strips section). */
export function playBadgeSvg({ text = 'DRINK IT • DRINK IT • DRINK IT • ', ink = PALETTE.green, bg = PALETTE.lime, shadow = PALETTE.teal } = {}) {
  const c = 100;
  return svgDoc([0, 0, 206, 206], `
<circle cx="${c + 4}" cy="${c + 6}" r="98" fill="${shadow}"/>
<circle cx="${c}" cy="${c}" r="98" fill="${bg}" stroke="${shadow}" stroke-width="3"/>
<g transform="translate(${c} ${c})">${circleText('Poppins-ExtraBold', text, { r: 78, size: 14, letterSpacing: 3.2, fill: ink })}</g>
<circle cx="${c}" cy="${c}" r="48" fill="none" stroke="${ink}" stroke-width="3"/>
<path d="M${c - 12} ${c - 22} L${c + 26} ${c} L${c - 12} ${c + 22} Z" fill="${ink}"/>`, { width: 206, height: 206 });
}

/** "Drink it" wordmark. Uses the dotless i (when available) so we can draw a bubble for the dot. */
export function logoSvg({ fill = PALETTE.green, bubble = PALETTE.lime, stroke = PALETTE.green } = {}) {
  const size = 58;
  const f = font('YoungSerif-Regular');
  const text = 'Drink it';
  const t = fitText('YoungSerif-Regular', text, { size });
  const h = 74;
  // bubble marks the i of "Drink"? keep the glyph dots (they remain legible), add a small bubble trail instead
  const body = `<path d="${t.d}" transform="translate(8 56) scale(${KS})" fill="${fill}"/>
<circle cx="${num(t.width + 24)}" cy="22" r="6" fill="${bubble}" stroke="${stroke}" stroke-width="2"/>
<circle cx="${num(t.width + 36)}" cy="11" r="3.4" fill="${bubble}" stroke="${stroke}" stroke-width="1.6"/>`;
  return svgDoc([0, 0, Math.ceil(t.width + 50), h], body, { title: 'Drink it' });
}

/** Translucent ice cube sticker (floating decoration). */
export function iceCubeSvg() {
  return svgDoc([0, 0, 120, 120], `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#bfe9ff" stop-opacity=".45"/></linearGradient></defs>
<g transform="rotate(-12 60 60)"><rect x="18" y="18" width="84" height="84" rx="18" fill="url(#g)" stroke="#fff" stroke-width="3"/><path d="M32 40 L48 30" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M30 70 L30 56" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M70 88 L88 80" stroke="#fff" stroke-opacity=".8" stroke-width="4" stroke-linecap="round"/></g>`, { width: 120, height: 120 });
}

/** Soap-bubble style fizz bubble. */
export function bubbleSvg() {
  return svgDoc([0, 0, 100, 100], `<circle cx="50" cy="50" r="44" fill="#fff" fill-opacity=".16" stroke="#fff" stroke-opacity=".95" stroke-width="5"/><circle cx="34" cy="32" r="9" fill="#fff" fill-opacity=".95"/>`, { width: 100, height: 100 });
}

/** Scalloped oval used as an image mask (about section). */
export function blobSvg() {
  const pts = [];
  const cx = 285, cy = 240, rx = 270, ry = 224, bumps = 7, amp = 15;
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const k = 1 + (amp / 240) * Math.cos(bumps * a);
    pts.push(`${num(cx + rx * k * Math.cos(a))} ${num(cy + ry * k * Math.sin(a))}`);
  }
  return svgDoc([0, 0, 570, 480], `<path d="M${pts.join(' L')} Z" fill="#000"/>`, { width: 570, height: 480, par: 'none' });
}

/** Row of five stars used as a CSS mask for ratings (fill or outline). */
export function starsSvg(kind = 'fill') {
  const star = (cx, cy, R, r) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r : R;
      pts.push(`${num(cx + rad * Math.cos(a))} ${num(cy + rad * Math.sin(a))}`);
    }
    return `M${pts.join(' L')} Z`;
  };
  let d = '';
  for (let i = 0; i < 5; i++) d += star(10 + i * 20, 10.6, 8.2, 3.7);
  const attrs = kind === 'fill'
    ? 'fill="#000" stroke="#000" stroke-width="1.6" stroke-linejoin="round"'
    : 'fill="none" stroke="#000" stroke-width="1.4" stroke-linejoin="round"';
  return svgDoc([0, 0, 100, 20], `<path d="${d}" ${attrs}/>`, { width: 100, height: 20 });
}

export function faviconSvg() {
  const t = fitText('YoungSerif-Regular', 'D', { size: 46 });
  return svgDoc([0, 0, 64, 64], `<rect width="64" height="64" rx="16" fill="${PALETTE.green}"/><circle cx="48" cy="16" r="6" fill="${PALETTE.lime}"/><path d="${t.d}" transform="translate(${num(32 - t.width / 2)} 48) scale(${KS})" fill="${PALETTE.lime}"/>`, { width: 64, height: 64 });
}

/** Round fruit/emoji style stickers for the call-to-action banners. */
export function fruitSvg(name) {
  return svgDoc([-32, -32, 64, 64], icon(name, { ink: '#fff', accent: '#fff' }), { width: 64, height: 64 });
}
