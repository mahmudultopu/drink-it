// Flat label artwork for the can wrap, drawn with Canvas 2D. One function per design.
// Coordinates: x in "design units" around the can (0 = front centre, +/-83 = back seam), y as a 0..1 fraction of the printed height.
// 1 design unit = 24.6 px for every can size, so a design looks the same on slim, standard and tall cans.
import { droplets } from './can3d.js';

export const PX = 24.6; // px per design unit
export const CIRC = 166.5; // design units around the can

const FONT_FILES = [
  ['PoppinsXB', 'Poppins-ExtraBold.ttf', '800'], ['PoppinsB', 'Poppins-Bold.ttf', '700'], ['PoppinsSB', 'Poppins-SemiBold.ttf', '600'],
  ['Anton', 'Anton-Regular.ttf'], ['Lilita', 'LilitaOne-Regular.ttf'], ['Righteous', 'Righteous-Regular.ttf'], ['Pacifico', 'Pacifico-Regular.ttf'],
  ['Lobster', 'Lobster-Regular.ttf'], ['Russo', 'RussoOne-Regular.ttf'], ['Bungee', 'Bungee-Regular.ttf'], ['Bebas', 'BebasNeue-Regular.ttf'],
  ['Oswald', 'Oswald.ttf', '200 700'], ['Fredoka', 'Fredoka.ttf', '300 700'], ['YoungSerif', 'YoungSerif-Regular.ttf'],
  ['Galada', 'Galada-Regular.ttf'], ['HindB', 'HindSiliguri-Bold.ttf', '700'], ['HindSB', 'HindSiliguri-SemiBold.ttf', '600'], ['Atma', 'Atma-Bold.ttf', '700'],
  ['Baloo', 'BalooDa2.ttf', '400 800'], ['TiroBangla', 'TiroBangla-Regular.ttf'],
];
export async function loadFonts() {
  await Promise.all(FONT_FILES.map(async ([name, file, weight]) => {
    const f = new FontFace(name, `url(/scripts/fonts/${file})`, weight ? { weight } : {});
    await f.load();
    document.fonts.add(f);
  }));
}

// ------------------------------------------------------------------ drawing helpers
export function makeG(ctx, W, H, kind, spec = {}) {
  const ph = H / PX; // printed height in design units
  const g = { ctx, W, H, ph, kind, spec, cx: W / 2, u: Math.min(1, ph / 120.2) };
  g.X = (mm) => g.cx + mm * PX; // design x -> px
  g.Y = (f) => f * H; // fraction -> px
  g.fu = (units) => units / ph; // design units -> vertical fraction
  return g;
}

export function bg(g, stops, { dir = 'v', from = 0, to = 1 } = {}) {
  const { ctx, W, H } = g;
  const gr = dir === 'v' ? ctx.createLinearGradient(0, H * from, 0, H * to) : ctx.createLinearGradient(W * from, 0, W * to, 0);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = gr;
  ctx.fillRect(0, H * from, W, H * (to - from));
}

export function text(g, str, { x = 0, y = 0.5, size = 20, font = 'PoppinsXB', weight = '', fill = '#fff', stroke, sw = 0, align = 'center', rot = 0, skew = 0, spacing = 0, shadow, maxW, italic = false, baseline = 'middle', alpha = 1 } = {}) {
  const { ctx } = g;
  ctx.save();
  ctx.translate(g.X(x), g.Y(y));
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  if (skew) ctx.transform(1, 0, skew, 1, 0, 0);
  const px = size * PX;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${px}px "${font}"`.replace('  ', ' ');
  ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.letterSpacing = `${spacing * PX}px`;
  ctx.globalAlpha = alpha;
  if (maxW) { const w = ctx.measureText(str).width; if (w > maxW * PX) ctx.scale((maxW * PX) / w, 1); }
  if (shadow) { ctx.shadowColor = shadow.c; ctx.shadowBlur = (shadow.b || 0) * PX; ctx.shadowOffsetX = (shadow.x || 0) * PX; ctx.shadowOffsetY = (shadow.y || 0) * PX; }
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = sw * PX; ctx.strokeStyle = stroke; ctx.strokeText(str, 0, 0); }
  ctx.fillStyle = fill; ctx.fillText(str, 0, 0);
  ctx.restore();
}

export function circle(g, x, y, r, fill, { stroke, sw = 0, alpha = 1 } = {}) {
  const { ctx } = g;
  ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(g.X(x), g.Y(y), r * PX, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = sw * PX; ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.restore();
}

// horizontal wave band that wraps all the way round the can
export function wave(g, y, amp, wl, fill, { thick = 0.05, phase = 0, alpha = 1 } = {}) {
  const { ctx, W, H } = g;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.beginPath();
  const a = amp * PX, L = wl * PX, t = thick * H, y0 = y * H;
  ctx.moveTo(0, y0 + Math.sin(phase) * a);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y0 + Math.sin(phase + (x / L) * Math.PI * 2) * a);
  for (let x = W; x >= 0; x -= 16) ctx.lineTo(x, y0 + t + Math.sin(phase + (x / L) * Math.PI * 2 + 0.6) * a * 0.8);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

export function poly(g, pts, fill, { stroke, sw = 0, alpha = 1 } = {}) {
  const { ctx } = g;
  ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(g.X(x), g.Y(y)) : ctx.moveTo(g.X(x), g.Y(y))));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = sw * PX; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.restore();
}

export function bolt(g, x, y, s, fill, stroke) {
  const { ctx } = g, S = s * PX;
  ctx.save(); ctx.translate(g.X(x), g.Y(y)); ctx.beginPath();
  [[0.15, -0.5], [-0.38, 0.06], [-0.02, 0.06], [-0.18, 0.5], [0.4, -0.1], [0.04, -0.1]].forEach(([px, py], i) => (i ? ctx.lineTo(px * S, py * S) : ctx.moveTo(px * S, py * S)));
  ctx.closePath(); ctx.fillStyle = fill; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = S * 0.05; ctx.shadowOffsetY = S * 0.03; ctx.fill();
  if (stroke) { ctx.shadowColor = 'transparent'; ctx.lineWidth = S * 0.04; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.restore();
}

export function bubbles(g, seed = 5, n = 40, color = '#fff', alpha = 0.35, area = [0.1, 0.9]) {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * CIRC, y = area[0] + rnd() * (area[1] - area[0]), r = 0.5 + rnd() * rnd() * 3.2;
    circle(g, x, y, r, null, { stroke: color, sw: 0.22, alpha: alpha * (0.5 + rnd() * 0.5) });
    circle(g, x - r * 0.3, y - g.fu(r * 0.3), r * 0.25, color, { alpha: alpha * 0.9 });
  }
}

// ------------------------------------------------------------------ icons
export function slice(g, x, y, r, { rind = '#3e9e2a', pith = '#f6fadc', flesh = '#9bd34a', flesh2 = '#d4ee8a', seg = 9, rot = 0 } = {}) {
  const { ctx } = g, R = r * PX;
  ctx.save(); ctx.translate(g.X(x), g.Y(y)); ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = R * 0.12; ctx.shadowOffsetY = R * 0.05;
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.arc(0, 0, R * 1.09, 0, 6.2832); ctx.fill();
  ctx.fillStyle = rind; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = pith; ctx.beginPath(); ctx.arc(0, 0, R * 0.925, 0, 6.2832); ctx.fill();
  const gr = ctx.createRadialGradient(0, 0, R * 0.05, 0, 0, R * 0.85);
  gr.addColorStop(0, flesh2); gr.addColorStop(1, flesh);
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R * 0.85, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = pith; ctx.lineWidth = R * 0.07; ctx.lineCap = 'round';
  for (let i = 0; i < seg; i++) { const a = (i / seg) * 6.2832; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08); ctx.lineTo(Math.cos(a) * R * 0.84, Math.sin(a) * R * 0.84); ctx.stroke(); }
  ctx.fillStyle = pith; ctx.beginPath(); ctx.arc(0, 0, R * 0.09, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = R * 0.05; ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 3.5, 4.6); ctx.stroke();
  ctx.restore();
}
export const FRUIT = {
  lime: { rind: '#2f8f2a', pith: '#f1f8d2', flesh: '#8cc63f', flesh2: '#d3ec7e' },
  lemon: { rind: '#e0a800', pith: '#fffbe0', flesh: '#ffd21a', flesh2: '#fff27a' },
  orange: { rind: '#e25a00', pith: '#fff1d6', flesh: '#ff8a00', flesh2: '#ffb347' },
  grapefruit: { rind: '#e0536b', pith: '#ffe3e6', flesh: '#f4727f', flesh2: '#ffa3a9' },
};
export function fruit(g, kind, x, y, r, rot = 0, seg = 9) { slice(g, x, y, r, { ...FRUIT[kind], rot, seg }); }

export function leaf(g, x, y, len, wid, ang, fill = '#2f9e44', fill2 = '#6fd05a') {
  const { ctx } = g, L = len * PX, Wd = wid * PX;
  ctx.save(); ctx.translate(g.X(x), g.Y(y)); ctx.rotate((ang * Math.PI) / 180);
  const gr = ctx.createLinearGradient(0, -Wd, 0, Wd); gr.addColorStop(0, fill2); gr.addColorStop(1, fill);
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.45, -Wd * 1.1, L, 0); ctx.quadraticCurveTo(L * 0.45, Wd * 1.1, 0, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Wd * 0.07; ctx.beginPath(); ctx.moveTo(L * 0.04, 0); ctx.lineTo(L * 0.92, 0); ctx.stroke();
  ctx.restore();
}

export function sunburst(g, x, y, r0, r1, n, fill, alpha = 1, rot = 0) {
  const { ctx } = g; ctx.save(); ctx.globalAlpha = alpha; ctx.translate(g.X(x), g.Y(y)); ctx.rotate(rot); ctx.fillStyle = fill;
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832, b = a + (6.2832 / n) * 0.5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0 * PX, Math.sin(a) * r0 * PX); ctx.lineTo(Math.cos(a) * r1 * PX, Math.sin(a) * r1 * PX); ctx.lineTo(Math.cos(b) * r1 * PX, Math.sin(b) * r1 * PX); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

export function grapes(g, x, y, r) {
  const { ctx } = g; const R = r * PX;
  const rows = [[0], [-0.9, 0.9], [-1.8, 0, 1.8], [-0.9, 0.9], [0]];
  ctx.save(); ctx.translate(g.X(x), g.Y(y));
  rows.forEach((row, ri) => row.forEach((dx) => {
    const cx = dx * R * 0.55, cy = (ri - 2) * R * 0.95;
    const gr = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.05, cx, cy, R * 0.62);
    gr.addColorStop(0, '#c58bf0'); gr.addColorStop(0.55, '#8a3fc8'); gr.addColorStop(1, '#4e1a86');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(cx - R * 0.2, cy - R * 0.24, R * 0.13, R * 0.08, -0.6, 0, 6.2832); ctx.fill();
  }));
  ctx.restore();
  leaf(g, x + 0.5, y - g.fu(r * 2.45), r * 1.6, r * 0.8, -35, '#2f8f3a', '#74d06a');
}

export function mango(g, x, y, r, rot = -25) {
  const { ctx } = g, R = r * PX;
  ctx.save(); ctx.translate(g.X(x), g.Y(y)); ctx.rotate((rot * Math.PI) / 180);
  const gr = ctx.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R * 1.2);
  gr.addColorStop(0, '#ffe066'); gr.addColorStop(0.55, '#ffb21f'); gr.addColorStop(1, '#e8641a');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, -R); ctx.bezierCurveTo(R * 1.1, -R * 0.9, R * 1.05, R * 0.9, 0, R); ctx.bezierCurveTo(-R * 1.0, R * 0.9, -R * 1.15, -R * 0.8, 0, -R); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(-R * 0.35, -R * 0.35, R * 0.18, R * 0.34, 0.5, 0, 6.2832); ctx.fill();
  ctx.restore();
  leaf(g, x + r * 0.15, y - g.fu(r * 1.0), r * 1.1, r * 0.45, -60, '#2f8f3a', '#74d06a');
}

export function chili(g, x, y, s, rot = 20) {
  const { ctx } = g, S = s * PX;
  ctx.save(); ctx.translate(g.X(x), g.Y(y)); ctx.rotate((rot * Math.PI) / 180);
  const gr = ctx.createLinearGradient(-S * 0.3, 0, S * 0.3, 0); gr.addColorStop(0, '#ff5a3c'); gr.addColorStop(1, '#a50f12');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-S * 0.18, -S * 0.5); ctx.bezierCurveTo(S * 0.4, -S * 0.4, S * 0.45, S * 0.35, -S * 0.05, S * 0.62); ctx.bezierCurveTo(S * 0.18, S * 0.2, -S * 0.1, -S * 0.1, -S * 0.18, -S * 0.5); ctx.fill();
  ctx.fillStyle = '#2d8a2d'; ctx.beginPath(); ctx.moveTo(-S * 0.22, -S * 0.52); ctx.quadraticCurveTo(-S * 0.1, -S * 0.78, S * 0.12, -S * 0.7); ctx.lineTo(S * 0.06, -S * 0.52); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Monster-style three-slash claw. w in units, h as a fraction of the printed height.
export function claw(g, x, y, w, h, fill, glow) {
  const { ctx } = g, Wd = w * PX, Hh = h * g.H;
  const pts = [
    [[0.0, 0.06], [0.22, 0.0], [0.27, 0.34], [0.2, 0.62], [0.27, 0.96], [0.08, 1.0], [0.05, 0.62], [0.1, 0.34]],
    [[0.33, 0.14], [0.5, 0.0], [0.6, 0.3], [0.62, 0.64], [0.56, 0.93], [0.4, 0.98], [0.36, 0.6]],
    [[0.66, 0.0], [1.0, 0.1], [0.96, 0.42], [0.94, 0.7], [0.9, 0.98], [0.71, 0.9], [0.74, 0.55], [0.7, 0.3]],
  ];
  ctx.save(); ctx.translate(g.X(x) - Wd / 2, g.Y(y) - Hh / 2);
  for (const p of pts) {
    ctx.beginPath(); p.forEach(([px, py], i) => (i ? ctx.lineTo(px * Wd, py * Hh) : ctx.moveTo(px * Wd, py * Hh))); ctx.closePath();
    ctx.fillStyle = fill; ctx.shadowColor = glow || fill; ctx.shadowBlur = Wd * 0.06; ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ designs
const D = {};
const wrapSheen = (g, a = 0.06) => {
  const { ctx, W, H } = g, sh = ctx.createLinearGradient(0, 0, W, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, `rgba(255,255,255,${a})`); sh.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
};
const smallPrint = (g, str, color = 'rgba(255,255,255,.85)', y = 0.95) => text(g, str, { y, size: 0.034 * g.ph, font: 'PoppinsB', fill: color, spacing: 0.4 });

// ---- COLA
D.coke = (g, o = {}) => {
  bg(g, ['#ea2230', '#d9101e', '#bd0c1a']); wrapSheen(g, 0.05);
  wave(g, 0.745, 3.2, 70, '#ffffff', { thick: 0.034, phase: 0.4 });
  wave(g, 0.795, 3.2, 70, 'rgba(255,255,255,.6)', { thick: 0.012, phase: 0.7 });
  if (o.latin) {
    text(g, 'Coca-Cola', { y: 0.38, size: 0.2 * g.ph, font: 'Lobster', fill: '#fff', maxW: 50, skew: -0.08, shadow: { c: 'rgba(120,0,10,.35)', b: 1.4, y: 0.8 } });
    text(g, 'ORIGINAL TASTE', { y: 0.55, size: 0.045 * g.ph, font: 'PoppinsB', fill: '#fff', spacing: 0.7, maxW: 44 });
    text(g, 'DELICIOUS & REFRESHING', { y: 0.88, size: 0.03 * g.ph, font: 'PoppinsSB', fill: 'rgba(255,255,255,.9)', spacing: 0.4, maxW: 44 });
  } else {
    text(g, 'কোকা-কোলা', { y: 0.37, size: 0.2 * g.ph, font: 'Galada', fill: '#fff', maxW: 50, shadow: { c: 'rgba(120,0,10,.35)', b: 1.4, y: 0.8 } });
    text(g, 'অরিজিনাল টেস্ট', { y: 0.55, size: 0.062 * g.ph, font: 'HindB', fill: '#fff', maxW: 38 });
    text(g, 'দারুণ স্বাদ ও রিফ্রেশিং', { y: 0.885, size: 0.036 * g.ph, font: 'HindSB', fill: 'rgba(255,255,255,.92)', maxW: 40 });
  }
  smallPrint(g, o.ml || '250 mL', 'rgba(255,255,255,.85)', 0.955);
};
D.cokezero = (g, o = {}) => {
  bg(g, ['#222', '#0d0d0d', '#000']); wrapSheen(g, 0.07);
  wave(g, 0.72, 3.4, 70, '#e41e2b', { thick: 0.05, phase: 0.2 }); wave(g, 0.79, 3.4, 70, '#fff', { thick: 0.008, phase: 0.45 });
  if (o.latin) text(g, 'Coca-Cola', { y: 0.34, size: 0.19 * g.ph, font: 'Lobster', fill: '#fff', maxW: 50, skew: -0.08 });
  else text(g, 'কোকা-কোলা', { y: 0.34, size: 0.19 * g.ph, font: 'Galada', fill: '#fff', maxW: 50 });
  text(g, 'ZERO SUGAR', { y: 0.52, size: 0.06 * g.ph, font: 'PoppinsXB', fill: '#e8242f', spacing: 0.9, maxW: 44 });
  text(g, 'জিরো সুগার', { y: 0.9, size: 0.04 * g.ph, font: 'HindB', fill: 'rgba(255,255,255,.9)', maxW: 30 });
  smallPrint(g, o.ml || '250 mL', 'rgba(255,255,255,.7)', 0.955);
};
const globe = (g, gx, gy, r, white = '#fff', blue = '#0b3fa0', red = '#e32934') => {
  const { ctx } = g; const cx = g.X(gx), cy = g.Y(gy), R = r * PX;
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.clip();
  ctx.fillStyle = red; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.fillStyle = blue; ctx.beginPath(); ctx.moveTo(cx - R, cy + R * 0.25); ctx.bezierCurveTo(cx - R * 0.3, cy + R * 0.02, cx + R * 0.2, cy + R * 0.95, cx + R, cy + R * 0.38); ctx.lineTo(cx + R, cy + R); ctx.lineTo(cx - R, cy + R); ctx.fill();
  ctx.fillStyle = white; ctx.beginPath(); ctx.moveTo(cx - R, cy + R * 0.2); ctx.bezierCurveTo(cx - R * 0.3, cy - R * 0.04, cx + R * 0.2, cy + R * 0.88, cx + R, cy + R * 0.32); ctx.lineTo(cx + R, cy + R * 0.44); ctx.bezierCurveTo(cx + R * 0.2, cy + R * 1.02, cx - R * 0.3, cy + R * 0.12, cx - R, cy + R * 0.34); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.lineWidth = 0.6 * PX; ctx.strokeStyle = white; ctx.stroke();
};
D.pepsi = (g, o = {}) => {
  bg(g, ['#1a63cc', '#0c47a6', '#07328a']); wrapSheen(g, 0.06);
  globe(g, 0, 0.4, 24 * g.u);
  if (o.latin) { text(g, 'pepsi', { y: 0.71, size: 0.1 * g.ph, font: 'PoppinsSB', fill: '#fff', maxW: 40, spacing: 0.2 }); }
  else { text(g, 'পেপসি', { y: 0.405, size: 0.085 * g.ph, font: 'Baloo', weight: '800', fill: '#ffffff', maxW: 30, shadow: { c: 'rgba(80,0,0,.45)', b: 0.8, y: 0.5 } }); text(g, 'ORIGINAL COLA', { y: 0.71, size: 0.04 * g.ph, font: 'PoppinsB', fill: '#fff', spacing: 0.6, maxW: 44 }); }
  text(g, o.latin ? (o.ml || '330 mL') : '২৫০ মি.লি.', { y: 0.935, size: 0.04 * g.ph, font: 'HindB', fill: 'rgba(255,255,255,.9)' });
};
D.pepsiblack = (g) => {
  bg(g, ['#1b1b1f', '#0a0a0c', '#000']); wrapSheen(g, 0.08);
  globe(g, 0, 0.34, 15 * g.u, '#e8ecff', '#1457d6', '#d8222d');
  text(g, 'পেপসি', { y: 0.34, size: 0.055 * g.ph, font: 'Baloo', weight: '800', fill: '#0b2d78', maxW: 20 });
  text(g, 'BLACK', { y: 0.62, size: 0.1 * g.ph, font: 'Bungee', fill: '#2f7dff', maxW: 40, shadow: { c: 'rgba(47,125,255,.7)', b: 2.5 } });
  text(g, 'ZERO SUGAR', { y: 0.74, size: 0.04 * g.ph, font: 'PoppinsB', fill: '#fff', spacing: 0.8 });
  smallPrint(g, '২৫০ মি.লি.', 'rgba(255,255,255,.7)', 0.955);
};
D.mojo = (g) => {
  bg(g, ['#a41818', '#7a0f10', '#4a0708']); wrapSheen(g, 0.06);
  sunburst(g, 0, 0.42, 14, 40, 22, 'rgba(255,200,87,.16)', 1, 0.1);
  circle(g, 0, 0.42, 21 * g.u, 'rgba(0,0,0,.18)'); circle(g, 0, 0.42, 21 * g.u, null, { stroke: '#ffc857', sw: 0.8 });
  text(g, 'mojo', { y: 0.42, size: 0.19 * g.ph, font: 'Baloo', weight: '800', fill: '#fff', maxW: 38, shadow: { c: '#e8870a', x: 0.5, y: 0.8, b: 0 } });
  bubbles(g, 11, 26, '#ffc857', 0.5, [0.1, 0.88]);
  poly(g, [[-13, 0.69], [13, 0.69], [15, 0.75], [-15, 0.75]], '#ffc857'); text(g, 'COLA', { y: 0.722, size: 0.05 * g.ph, font: 'PoppinsXB', fill: '#7a0f10', spacing: 1.4 });
  smallPrint(g, '250 mL', 'rgba(255,255,255,.75)', 0.955);
};
D.mojozero = (g) => {
  bg(g, ['#3a3a3f', '#18181b', '#050506']); wrapSheen(g, 0.08);
  text(g, 'mojo', { y: 0.33, size: 0.15 * g.ph, font: 'Baloo', weight: '800', fill: '#fff', maxW: 34 });
  text(g, 'ZERO', { y: 0.55, size: 0.17 * g.ph, font: 'Bungee', fill: '#ffc857', maxW: 44, shadow: { c: 'rgba(255,200,87,.5)', b: 2 } });
  text(g, 'SUGAR FREE', { y: 0.71, size: 0.042 * g.ph, font: 'PoppinsB', fill: '#fff', spacing: 0.9 });
  bubbles(g, 5, 18, '#ffc857', 0.35, [0.1, 0.9]); smallPrint(g, '250 mL', 'rgba(255,255,255,.65)', 0.955);
};
D.naga = (g) => {
  bg(g, ['#3a0a0a', '#240505', '#0c0202']); wrapSheen(g, 0.07);
  sunburst(g, 0, 0.32, 10, 46, 18, 'rgba(255,120,0,.28)', 1, 0.2);
  circle(g, 0, 0.3, 17 * g.u, 'rgba(255,90,0,.35)');
  chili(g, 0, 0.3, 36 * g.u, 22);
  text(g, 'Naga', { y: 0.58, size: 0.15 * g.ph, font: 'Lilita', fill: '#ffd35a', stroke: '#6e070a', sw: 1.2, maxW: 36 });
  text(g, 'MOJO', { y: 0.72, size: 0.095 * g.ph, font: 'Baloo', weight: '800', fill: '#fff', spacing: 1, maxW: 34 });
  text(g, 'SPICY COLA', { y: 0.82, size: 0.034 * g.ph, font: 'PoppinsB', fill: '#ffd35a', spacing: 0.9 }); smallPrint(g, '250 mL', undefined, 0.955);
};
D.rc = (g) => {
  bg(g, ['#c8102e', '#9d0b21', '#6c0716']); wrapSheen(g, 0.06);
  wave(g, 0.8, 3, 60, '#fff', { thick: 0.03 }); wave(g, 0.85, 3, 60, '#1b4db3', { thick: 0.025, phase: 0.5 });
  circle(g, 0, 0.38, 21 * g.u, '#fff'); circle(g, 0, 0.38, 18.5 * g.u, '#1b4db3');
  text(g, 'RC', { y: 0.385, size: 0.2 * g.ph, font: 'Bungee', fill: '#fff', maxW: 30 });
  text(g, 'ROYAL CROWN COLA', { y: 0.65, size: 0.036 * g.ph, font: 'PoppinsB', fill: '#fff', spacing: 0.5, maxW: 44 }); smallPrint(g, '250 mL', 'rgba(255,255,255,.8)', 0.96);
};
D.houston = (g) => {
  bg(g, ['#1c1c1c', '#0a0a0a', '#000']); wrapSheen(g, 0.06);
  const { ctx } = g, gx = g.X(0), gy = g.Y(0.4), r = 40 * PX * g.u;
  const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, 'rgba(150,255,60,.95)'); gr.addColorStop(0.5, 'rgba(60,200,30,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, gy, r, 0, 6.2832); ctx.fill();
  sunburst(g, 0, 0.4, 9, 36, 16, 'rgba(180,255,90,.35)', 1, 0.05);
  text(g, 'H', { y: 0.4, size: 0.34 * g.ph, font: 'Bungee', fill: '#0a0a0a', stroke: '#9cff4a', sw: 0.8, maxW: 26 });
  text(g, 'HOUSTON', { y: 0.7, size: 0.075 * g.ph, font: 'Bungee', fill: '#fff', spacing: 0.6, maxW: 44 });
  text(g, 'SOFT DRINK', { y: 0.79, size: 0.034 * g.ph, font: 'PoppinsB', fill: '#9cff4a', spacing: 1 }); smallPrint(g, '250 mL', 'rgba(255,255,255,.65)', 0.955);
};

// ---- CITRUS
D.sprite = (g, o = {}) => {
  bg(g, ['#10a64e', '#0a8a3e', '#06672d']); wrapSheen(g, 0.06);
  bubbles(g, 21, 40, '#d6f25a', 0.5, [0.05, 0.95]);
  poly(g, [[-30, 0.0], [-10, 0.0], [-34, 1.0], [-54, 1.0]], 'rgba(214,242,90,.16)'); poly(g, [[16, 0.0], [34, 0.0], [10, 1.0], [-8, 1.0]], 'rgba(214,242,90,.12)');
  fruit(g, 'lime', 16, 0.22, 11 * g.u, 0.3);
  text(g, 'Sprite', { y: 0.5, size: 0.2 * g.ph, font: 'Lilita', fill: '#fff', stroke: '#066b30', sw: 1.4, maxW: 48, skew: -0.1, shadow: { c: 'rgba(0,0,0,.3)', b: 1, y: 0.9 } });
  if (!o.latin) text(g, 'স্প্রাইট', { y: 0.68, size: 0.07 * g.ph, font: 'HindB', fill: '#d6f25a', maxW: 30 });
  text(g, 'LEMON-LIME FLAVOURED', { y: 0.78, size: 0.028 * g.ph, font: 'PoppinsB', fill: '#fff', spacing: 0.5, maxW: 42 }); smallPrint(g, o.ml || '250 mL', undefined, 0.955);
};
D.sevenup = (g, o = {}) => {
  bg(g, ['#2cb34a', '#1a9a38', '#0c7426']); wrapSheen(g, 0.06);
  poly(g, [[-40, 0.0], [-20, 0.0], [-30, 1.0], [-52, 1.0]], 'rgba(255,255,255,.08)'); bubbles(g, 4, 28, '#fff', 0.4, [0.05, 0.95]);
  text(g, '7', { x: -7, y: 0.4, size: 0.44 * g.ph, font: 'Fredoka', weight: '700', fill: '#fff', maxW: 22, shadow: { c: 'rgba(0,0,0,.25)', b: 1, y: 1 } });
  circle(g, -17, 0.24, 3.4, '#e2202a'); text(g, 'UP', { x: 11, y: 0.5, size: 0.17 * g.ph, font: 'Fredoka', weight: '700', fill: '#fff', maxW: 22 });
  if (!o.latin) text(g, 'সেভেন আপ', { y: 0.73, size: 0.05 * g.ph, font: 'HindB', fill: '#f6ff9a', maxW: 30 });
  fruit(g, 'lemon', 18, 0.2, 7 * g.u, 0.2);
  text(g, 'REFRESHING LEMONY TASTE', { y: 0.82, size: 0.026 * g.ph, font: 'PoppinsB', fill: '#fff', spacing: 0.4, maxW: 44 }); smallPrint(g, o.ml || '250 mL', undefined, 0.955);
};
D.mirinda = (g) => {
  bg(g, ['#ff8a1a', '#f26b0f', '#c24a00']); wrapSheen(g, 0.06);
  for (const [x, y, r, rot] of [[-21, 0.2, 7, 0.4], [22, 0.8, 7, 1.1], [-19, 0.88, 5, 0.2]]) fruit(g, 'orange', x, y, r * g.u, rot, 8);
  bubbles(g, 9, 30, '#ffe0a3', 0.5, [0.05, 0.95]);
  text(g, 'M', { y: 0.38, size: 0.3 * g.ph, font: 'Righteous', fill: '#fff', maxW: 30, shadow: { c: '#c24a00', x: 0.7, y: 1.1 } });
  text(g, 'Mirinda', { y: 0.58, size: 0.095 * g.ph, font: 'Righteous', fill: '#fff', maxW: 40 });
  text(g, 'মিরিন্ডা', { y: 0.7, size: 0.06 * g.ph, font: 'HindB', fill: '#ffe0a3', maxW: 26 });
  text(g, 'ORANGE FLAVOUR', { y: 0.8, size: 0.028 * g.ph, font: 'PoppinsB', fill: '#fff', spacing: 0.5 }); smallPrint(g, '250 mL', undefined, 0.955);
};
D.fanta = (g, o = {}) => {
  bg(g, ['#ffa31a', '#fb8b00', '#e06c00']); wrapSheen(g, 0.06);
  sunburst(g, 0, 0.6, 8, 40, 20, 'rgba(255,230,150,.2)', 1, 0.1); bubbles(g, 2, 30, '#fff', 0.45, [0.05, 0.95]);
  text(g, 'Fanta', { y: 0.3, size: 0.15 * g.ph, font: 'Lilita', fill: '#fff', stroke: '#1d5fb8', sw: 1.6, maxW: 44, skew: -0.08, shadow: { c: 'rgba(0,0,0,.25)', b: 0.8, y: 0.9 } });
  fruit(g, 'orange', 0, 0.6, 16 * g.u, 0.3, 10); leaf(g, 12, 0.47, 9, 4, -35, '#2f9e3a', '#7bd35a');
  text(g, 'ORANGE', { y: 0.84, size: 0.04 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 1 }); smallPrint(g, o.ml || '250 mL', undefined, 0.955);
};
D.dew = (g, o = {}) => {
  bg(g, ['#15330f', '#0a1c08', '#020802']); wrapSheen(g, 0.07);
  let s = 9; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 46; i++) { const x = (rnd() - 0.5) * 120, y = rnd(), w = 4 + rnd() * 16; poly(g, [[x, y], [x + w, y - 0.08 * rnd()], [x + w * 0.4, y + 0.1 + 0.06 * rnd()]], ['#6dbe2e', '#9be04b', '#3b8f1a', '#c9f56a'][i % 4], { alpha: 0.5 + rnd() * 0.5 }); }
  text(g, 'Mountain', { y: 0.36, size: 0.1 * g.ph, font: 'Russo', fill: '#8be04a', stroke: '#0a1c08', sw: 0.9, maxW: 46, rot: -14, skew: -0.2 });
  text(g, 'DEW', { y: 0.54, size: 0.24 * g.ph, font: 'Russo', fill: '#e8242f', stroke: '#fff', sw: 1.1, maxW: 40, rot: -14, skew: -0.2, shadow: { c: 'rgba(0,0,0,.5)', b: 1, y: 1 } });
  text(g, 'সাইট্রাস কিক', { y: 0.79, size: 0.04 * g.ph, font: 'HindB', fill: '#c9f56a', maxW: 30 }); smallPrint(g, o.ml || '250 mL', undefined, 0.955);
};
D.clemon = (g) => {
  bg(g, ['#fbe21c', '#f1d000', '#d9b800']); wrapSheen(g, 0.08);
  bubbles(g, 6, 30, '#fff', 0.55, [0.05, 0.95]);
  fruit(g, 'lemon', 6, 0.6, 14 * g.u, 0.4, 10); leaf(g, -8, 0.5, 11, 5, -140, '#1e8c3a', '#6fd05a');
  text(g, 'Clemon', { y: 0.3, size: 0.17 * g.ph, font: 'Lilita', fill: '#15803d', stroke: '#fff', sw: 1.2, maxW: 46, skew: -0.06, shadow: { c: 'rgba(0,0,0,.2)', b: 0.8, y: 0.8 } });
  poly(g, [[-17, 0.795], [17, 0.795], [19, 0.855], [-19, 0.855]], '#15803d'); text(g, 'LEMON SODA', { y: 0.825, size: 0.032 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 0.4, maxW: 30 }); smallPrint(g, '250 mL', 'rgba(21,83,45,.8)', 0.955);
};
D.clemonmojito = (g) => {
  bg(g, ['#34c27c', '#1aa764', '#0c7d48']); wrapSheen(g, 0.07);
  bubbles(g, 12, 30, '#e7ffd0', 0.5, [0.05, 0.95]);
  leaf(g, -18, 0.62, 16, 7, -50, '#157a3d', '#7ee05a'); leaf(g, -14, 0.7, 14, 6, -90, '#157a3d', '#7ee05a'); leaf(g, 22, 0.6, 14, 6, -125, '#157a3d', '#7ee05a');
  fruit(g, 'lime', 8, 0.66, 11 * g.u, 0.5, 9);
  text(g, 'Clemon', { y: 0.27, size: 0.15 * g.ph, font: 'Lilita', fill: '#fff', stroke: '#0c5a33', sw: 1.2, maxW: 46, skew: -0.06 });
  text(g, 'MOJITO', { y: 0.42, size: 0.1 * g.ph, font: 'Lilita', fill: '#ffee58', stroke: '#0c5a33', sw: 1, maxW: 40, spacing: 0.6 });
  smallPrint(g, '250 mL', undefined, 0.955);
};

// ---- ENERGY
D.speed = (g) => {
  bg(g, ['#e0121c', '#b30c14', '#6e070c']); wrapSheen(g, 0.06);
  poly(g, [[-36, 0.0], [-6, 0.0], [-36, 1.0], [-72, 1.0]], 'rgba(0,0,0,.45)'); poly(g, [[22, 0.0], [34, 0.0], [4, 1.0], [-8, 1.0]], 'rgba(255,212,0,.5)');
  text(g, 'SPEED', { y: 0.34, size: 0.2 * g.ph, font: 'Anton', fill: '#fff', maxW: 46, skew: -0.2, shadow: { c: 'rgba(0,0,0,.5)', b: 1, y: 1.2 } });
  bolt(g, 0, 0.6, 30 * g.u, '#ffd400', '#7a4a00');
  text(g, 'ENERGY DRINK', { y: 0.86, size: 0.04 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 0.9, maxW: 40 }); smallPrint(g, '250 mL', undefined, 0.955);
};
D.tiger = (g) => {
  bg(g, ['#171410', '#0a0907', '#000']); wrapSheen(g, 0.07);
  let s = 5; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 16; i++) { const x = (rnd() - 0.5) * 110, y = rnd() * 0.9; poly(g, [[x, y], [x + 8 + rnd() * 10, y + 0.02], [x + 30 * (rnd() - 0.3), y + 0.16 + rnd() * 0.12], [x + 2, y + 0.05]], '#e8870a', { alpha: 0.45 + rnd() * 0.4 }); }
  text(g, 'ROYAL', { y: 0.34, size: 0.12 * g.ph, font: 'Bebas', fill: '#f0c14b', spacing: 1.2, maxW: 40 });
  text(g, 'TIGER', { y: 0.5, size: 0.2 * g.ph, font: 'Anton', fill: '#f59e0b', stroke: '#000', sw: 0.8, maxW: 46, shadow: { c: 'rgba(245,158,11,.5)', b: 2 } });
  text(g, 'ENERGY DRINK', { y: 0.68, size: 0.036 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 1 }); smallPrint(g, '250 mL', 'rgba(255,255,255,.7)', 0.955);
};
const bullEmblem = (g, x, y, s) => {
  const { ctx } = g, S = s * PX, cx = g.X(x), cy = g.Y(y);
  ctx.save(); ctx.translate(cx, cy);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.5); sg.addColorStop(0, '#fff3a0'); sg.addColorStop(0.6, '#ffc61a'); sg.addColorStop(1, '#f59e0b');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, -S * 0.05, S * 0.34, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#d9202a';
  // two charging bulls in profile, facing each other
  const bull = [[0.10, 0.14], [0.16, 0.02], [0.30, -0.10], [0.46, -0.13], [0.62, -0.08], [0.70, 0.0], [0.72, -0.14], [0.76, -0.04], [0.74, 0.12], [0.68, 0.26], [0.64, 0.46], [0.54, 0.46], [0.52, 0.32], [0.38, 0.30], [0.34, 0.46], [0.24, 0.46], [0.22, 0.28], [0.16, 0.2], [0.07, 0.22]];
  for (const m of [1, -1]) {
    ctx.save(); ctx.scale(m, 1); ctx.beginPath();
    bull.forEach(([bx, by], i) => (i ? ctx.lineTo(bx * S, by * S) : ctx.moveTo(bx * S, by * S)));
    ctx.closePath(); ctx.fill();
    // horn
    ctx.beginPath(); ctx.moveTo(0.1 * S, 0.14 * S); ctx.lineTo(0.02 * S, 0.02 * S); ctx.lineTo(0.14 * S, 0.1 * S); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
};
D.redbull = (g) => {
  bg(g, ['#0f3f99', '#0a2f78', '#071f55']);
  const { ctx, W, H } = g;
  ctx.save(); ctx.beginPath(); ctx.moveTo(0, H * 0.25); ctx.lineTo(W, H * 0.25 - 0.015 * W); ctx.lineTo(W, H * 0.62); ctx.lineTo(0, H * 0.62 + 0.015 * W); ctx.closePath();
  const sg = ctx.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, '#e7eaee'); sg.addColorStop(1, '#a9aeb7'); ctx.fillStyle = sg; ctx.fill(); ctx.restore();
  wrapSheen(g, 0.08);
  bullEmblem(g, 0, 0.42, 36 * g.u);
  text(g, 'Red Bull', { y: 0.7, size: 0.12 * g.ph, font: 'Anton', fill: '#fff', stroke: '#0a2f78', sw: 0.5, maxW: 40, skew: -0.2 });
  text(g, 'ENERGY DRINK', { y: 0.82, size: 0.034 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 1 });
  text(g, 'GIVES YOU WIIINGS', { y: 0.12, size: 0.028 * g.ph, font: 'PoppinsB', fill: '#0a2f78', spacing: 0.8 }); smallPrint(g, '250 mL', undefined, 0.955);
};
D.redbullsf = (g) => {
  bg(g, ['#d7dbe2', '#bcc2cc', '#9ea5b1']);
  const { ctx, W, H } = g;
  ctx.save(); const sg = ctx.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, '#9fd0ff'); sg.addColorStop(1, '#4f9be8'); ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(0, H * 0.62); ctx.lineTo(W, H * 0.62 - 0.015 * W); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill(); ctx.restore();
  wrapSheen(g, 0.1);
  bullEmblem(g, 0, 0.36, 34 * g.u);
  text(g, 'Red Bull', { y: 0.58, size: 0.12 * g.ph, font: 'Anton', fill: '#12306e', maxW: 40, skew: -0.2 });
  text(g, 'SUGARFREE', { y: 0.72, size: 0.045 * g.ph, font: 'PoppinsXB', fill: '#12306e', spacing: 1 });
  text(g, 'ENERGY DRINK', { y: 0.82, size: 0.03 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 1 }); smallPrint(g, '250 mL', 'rgba(18,48,110,.8)', 0.955);
};
D.monster = (g) => {
  bg(g, ['#1a1a1a', '#080808', '#000']); wrapSheen(g, 0.08);
  claw(g, 0, 0.4, 40 * g.u, 0.42, '#80ff2a', '#80ff2a');
  text(g, 'MONSTER', { y: 0.72, size: 0.07 * g.ph, font: 'Bungee', fill: '#80ff2a', spacing: 0.4, maxW: 44 });
  text(g, 'ENERGY', { y: 0.8, size: 0.05 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 1.2 }); smallPrint(g, '500 mL', 'rgba(255,255,255,.7)', 0.955);
};
D.monsterwhite = (g) => {
  bg(g, ['#fafafa', '#e4e6ea', '#c3c7cf']); wrapSheen(g, 0.2);
  claw(g, 0, 0.4, 40 * g.u, 0.42, '#7d838d', '#fff');
  text(g, 'MONSTER', { y: 0.72, size: 0.07 * g.ph, font: 'Bungee', fill: '#4b5059', spacing: 0.4, maxW: 44 });
  text(g, 'ULTRA', { y: 0.8, size: 0.06 * g.ph, font: 'PoppinsXB', fill: '#8a909b', spacing: 1.4 }); smallPrint(g, '500 mL', 'rgba(60,64,72,.8)', 0.955);
};

// ---- IMPORTED
D.drpepper = (g) => {
  bg(g, ['#8e1630', '#6e0f24', '#470817']); wrapSheen(g, 0.06);
  wave(g, 0.7, 3, 70, '#e8242f', { thick: 0.06 }); wave(g, 0.8, 3, 70, '#fff', { thick: 0.012, phase: 0.5 });
  text(g, 'Dr', { y: 0.3, size: 0.2 * g.ph, font: 'Righteous', fill: '#fff', maxW: 26, skew: -0.12, shadow: { c: 'rgba(0,0,0,.4)', b: 1, y: 1 } });
  text(g, 'Pepper', { y: 0.5, size: 0.14 * g.ph, font: 'Righteous', fill: '#fff', maxW: 44, skew: -0.12, shadow: { c: 'rgba(0,0,0,.4)', b: 1, y: 1 } });
  circle(g, 22, 0.25, 6, '#e8242f', { stroke: '#fff', sw: 0.5 }); text(g, '23', { x: 22, y: 0.25, size: 0.07 * g.ph, font: 'PoppinsXB', fill: '#fff' });
  smallPrint(g, '355 mL', undefined, 0.955);
};
D.gingerale = (g) => {
  bg(g, ['#e0a52e', '#c88a14', '#a06a0a']); wrapSheen(g, 0.08);
  circle(g, 0, 0.6, 18 * g.u, 'rgba(255,240,200,.35)'); circle(g, 0, 0.6, 18 * g.u, null, { stroke: '#fff7d6', sw: 0.5 });
  const { ctx } = g; ctx.save(); ctx.translate(g.X(0), g.Y(0.6)); ctx.fillStyle = '#f4d9a3'; ctx.strokeStyle = '#a06a0a'; ctx.lineWidth = 0.25 * PX;
  for (const [dx, dy, rx, ry, r] of [[-5, 3, 9, 4.5, -0.5], [5, -2, 8, 4, 0.7], [0, 6, 7, 3.6, 0.1]]) { ctx.beginPath(); ctx.ellipse(dx * PX, dy * PX, rx * PX, ry * PX, r, 0, 6.2832); ctx.fill(); ctx.stroke(); }
  ctx.restore();
  text(g, 'Schweppes', { y: 0.3, size: 0.13 * g.ph, font: 'Lobster', fill: '#fff', maxW: 46, shadow: { c: 'rgba(0,0,0,.3)', b: 1, y: 0.8 } });
  text(g, 'GINGER ALE', { y: 0.45, size: 0.05 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 1.1, maxW: 40 });
  text(g, 'DRY · SPARKLING', { y: 0.84, size: 0.03 * g.ph, font: 'PoppinsB', fill: '#fff7d6', spacing: 0.8 }); smallPrint(g, '330 mL', 'rgba(255,255,255,.8)', 0.955);
};
D.tonic = (g) => {
  bg(g, ['#2a64b0', '#1d4e89', '#102f57']); wrapSheen(g, 0.1);
  bubbles(g, 17, 36, '#cfe8ff', 0.55, [0.05, 0.95]);
  fruit(g, 'lime', 0, 0.64, 14 * g.u, 0.2, 9);
  text(g, 'Schweppes', { y: 0.3, size: 0.13 * g.ph, font: 'Lobster', fill: '#e8eef7', maxW: 46 });
  text(g, 'TONIC WATER', { y: 0.45, size: 0.05 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 1.1, maxW: 40 }); smallPrint(g, '330 mL', 'rgba(255,255,255,.8)', 0.955);
};
D.rani = (g, o = {}) => {
  const f = o.flavor || 'grape';
  const pal = { grape: ['#8a46c2', '#6a2da0', '#46186f'], orange: ['#ff9a1f', '#f27d0a', '#c25a00'], mango: ['#ffc21f', '#f2a900', '#c98300'] }[f];
  bg(g, pal); wrapSheen(g, 0.08); bubbles(g, 13, 30, '#fff', 0.45, [0.05, 0.95]);
  if (f === 'grape') grapes(g, 0, 0.69, 7 * g.u); else if (f === 'orange') fruit(g, 'orange', 0, 0.67, 14 * g.u, 0.3, 10); else mango(g, 0, 0.68, 11 * g.u);
  text(g, 'RANI', { y: 0.27, size: 0.2 * g.ph, font: 'Lilita', fill: '#ffe45c', stroke: '#3a1558', sw: 1.2, maxW: 44, shadow: { c: 'rgba(0,0,0,.3)', b: 1, y: 1 } });
  text(g, 'FLOAT', { y: 0.42, size: 0.1 * g.ph, font: 'Lilita', fill: '#fff', spacing: 1.4 });
  text(g, f.toUpperCase(), { y: 0.84, size: 0.045 * g.ph, font: 'PoppinsXB', fill: '#fff', spacing: 1.2 }); smallPrint(g, '240 mL', 'rgba(255,255,255,.8)', 0.955);
};

export const DESIGNS = D;

// ------------------------------------------------------------------ entry point
export function drawLabel(designId, kind, { dropletDensity = 1, seed = 7, size = 4096, opts = {} } = {}) {
  const W0 = 4096, k = size / W0; // artwork is always laid out for a 4096 px wrap, then scaled
  const R = { slim: 26.5, mini: 26.5, std: 33, tall: 33 }[kind];
  const H_MM = { slim: 134, mini: 106, std: 115, tall: 168 }[kind] - 13.8;
  const H0 = Math.round(H_MM * (W0 / (2 * Math.PI * R)));
  const c = document.createElement('canvas'); c.width = size; c.height = Math.round(H0 * k);
  const b = document.createElement('canvas'); b.width = size; b.height = Math.round(H0 * k);
  const ctx = c.getContext('2d'), bctx = b.getContext('2d');
  ctx.scale(k, k); bctx.scale(k, k);
  bctx.fillStyle = '#000'; bctx.fillRect(0, 0, W0, H0);
  const g = makeG(ctx, W0, H0, kind);
  const fn = D[designId];
  if (!fn) throw new Error('unknown design ' + designId);
  fn(g, opts);
  if (dropletDensity > 0) droplets(ctx, bctx, W0, H0, { count: 1000, density: dropletDensity, seed, minR: 5, maxR: 24 });
  return { labelCanvas: c, bumpCanvas: b, W: c.width, H: c.height };
}
