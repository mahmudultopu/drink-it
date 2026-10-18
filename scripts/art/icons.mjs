// Flat, friendly flavour icons drawn around (0,0) with a radius of roughly 26 units.
// Each returns an SVG fragment. They are original drawings (no trademarked marks).
import { lighten, darken, num } from './lib.mjs';

const pt = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

function citrus({ rind, pith, flesh, seg = 8, r = 24, gap = 0.1, dot = pith }) {
  const inner = r * 0.8;
  let wedges = '';
  for (let i = 0; i < seg; i++) {
    const a0 = (i * 2 * Math.PI) / seg + gap - Math.PI / 2;
    const a1 = ((i + 1) * 2 * Math.PI) / seg - gap - Math.PI / 2;
    const [x0, y0] = pt(inner, a0), [x1, y1] = pt(inner, a1);
    wedges += `<path d="M0 0 L${num(x0)} ${num(y0)} A${num(inner)} ${num(inner)} 0 0 1 ${num(x1)} ${num(y1)} Z" fill="${flesh}" stroke="${flesh}" stroke-width="1.6" stroke-linejoin="round"/>`;
  }
  return `<g><circle r="${r}" fill="${rind}"/><circle r="${num(r * 0.9)}" fill="${pith}"/>${wedges}<circle r="2.2" fill="${dot}"/></g>`;
}

const leaf = (x, y, rot, s, fill) =>
  `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 0 C 6 -8 16 -8 22 0 C 16 8 6 8 0 0 Z" fill="${fill}"/>`;

export const ICONS = {
  // bubbly cola splash
  cola({ ink = '#fff' }) {
    const c = [[-9, 7, 9], [8, -1, 11], [-3, -14, 6], [14, 14, 5.5], [-15, -6, 4.2], [2, 17, 4], [17, -15, 3.4]];
    return `<g>${c.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${ink}" stroke-width="2.4"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${num(r * 0.2)}" fill="${ink}"/>`).join('')}</g>`;
  },
  lime() { return citrus({ rind: '#2E8B2E', pith: '#E7F7C2', flesh: '#9BD64A', seg: 8, dot: '#E7F7C2' }); },
  lemon() { return citrus({ rind: '#F2B705', pith: '#FFF6C7', flesh: '#FFE14D', seg: 9, dot: '#FFF6C7' }); },
  orange() { return citrus({ rind: '#F26B0F', pith: '#FFE2B8', flesh: '#FF9F1C', seg: 10, dot: '#FFE2B8' }); },
  mojito() {
    return `<g>${citrus({ rind: '#2E8B2E', pith: '#E7F7C2', flesh: '#9BD64A', seg: 8, r: 18 })}
      <g transform="translate(-6 -16) rotate(-30)">${leaf(0, 0, 0, 0.95, '#1E9E57')}</g>
      <g transform="translate(8 -18) rotate(15)">${leaf(0, 0, 0, 0.8, '#37B96B')}</g></g>`;
  },
  bolt({ fill = '#FFD400', stroke = '#1a1a1a' }) {
    return `<g><path d="M6 -26 L-14 4 H-1 L-6 26 L16 -6 H3 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round"/></g>`;
  },
  zero({ ink = '#fff', accent = '#9CF' }) {
    return `<g><circle r="19" fill="none" stroke="${ink}" stroke-width="5"/><path d="M-9 14 L9 -14" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>${leaf(8, -20, -50, 0.55, accent)}</g>`;
  },
  snow({ ink = '#fff' }) {
    let s = '';
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      const [x, y] = pt(23, a);
      s += `<path d="M${num(-x)} ${num(-y)} L${num(x)} ${num(y)}" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>`;
      for (const sgn of [-1, 1]) {
        const [bx, by] = pt(15, a), [dx, dy] = pt(7, a + sgn * 0.9);
        s += `<path d="M${num(sgn * bx)} ${num(sgn * by)} l${num(dx)} ${num(dy)}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
        s += `<path d="M${num(sgn * bx)} ${num(sgn * by)} l${num(-dx)} ${num(-dy)}" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
      }
    }
    return `<g>${s}</g>`;
  },
  grape() {
    const pts = [[-11, -9], [0, -9], [11, -9], [-6, 3], [6, 3], [0, 15], [-17, 2], [17, 2]];
    return `<g>${leaf(2, -18, -60, 0.8, '#3FA34D')}<path d="M0 -20 v-6" stroke="#6b4a2b" stroke-width="3" stroke-linecap="round"/>${pts.slice(0, 6).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#7B3FA0"/><circle cx="${x - 2.5}" cy="${y - 2.5}" r="2" fill="#c7a1de"/>`).join('')}</g>`;
  },
  peach() {
    return `<g><path d="M0 -20 C 20 -24 28 -2 18 14 C 12 24 4 26 0 22 C -4 26 -12 24 -18 14 C -28 -2 -20 -24 0 -20 Z" fill="#FF9466"/><path d="M0 -20 C -4 -6 -4 10 0 22" stroke="#E5653A" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M-14 -4 C -12 -12 -6 -16 -2 -16" stroke="#FFC7A8" stroke-width="3" fill="none" stroke-linecap="round"/>${leaf(1, -21, -35, 0.85, '#3FA34D')}</g>`;
  },
  mango() {
    return `<g transform="rotate(-25)"><path d="M-6 -22 C 14 -26 28 -6 22 12 C 18 24 0 28 -12 20 C -26 10 -22 -14 -6 -22 Z" fill="#FFB400"/><path d="M-4 -18 C 12 -20 22 -4 18 10" stroke="#FFD866" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M-6 -22 C -2 -28 4 -28 6 -24" fill="none" stroke="#6b4a2b" stroke-width="3" stroke-linecap="round"/>${leaf(2, -25, -20, 0.8, '#2F9E44')}</g>`;
  },
  chili() {
    return `<g transform="rotate(20)"><path d="M-14 -16 C 14 -26 30 -8 18 18 C 12 28 2 30 -4 24 C 10 16 12 2 -8 -8 C -16 -12 -18 -14 -14 -16 Z" fill="#E4262C"/><path d="M-6 -14 C 10 -20 22 -8 16 8" stroke="#FF8A8A" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M-14 -16 C -18 -22 -12 -28 -6 -26" fill="none" stroke="#2F9E44" stroke-width="4.5" stroke-linecap="round"/></g>`;
  },
  cherry() {
    return `<g><path d="M-8 4 C -6 -10 2 -20 12 -24 M10 8 C 10 -6 12 -16 12 -24" stroke="#4d8f2b" stroke-width="2.6" fill="none" stroke-linecap="round"/>${leaf(12, -24, -20, 0.7, '#4d8f2b')}<circle cx="-9" cy="10" r="10" fill="#D0123B"/><circle cx="11" cy="14" r="10" fill="#E01E4A"/><circle cx="-12" cy="7" r="2.6" fill="#ff9db2"/><circle cx="8" cy="11" r="2.6" fill="#ffb0c1"/></g>`;
  },
  ginger() {
    return `<g><path d="M-20 6 C -22 -4 -12 -8 -6 -6 C -4 -14 4 -18 10 -12 C 16 -16 24 -8 20 0 C 26 4 22 14 14 14 C 8 20 -4 20 -8 14 C -16 16 -22 12 -20 6 Z" fill="#E0B070" stroke="#B07B38" stroke-width="2" stroke-linejoin="round"/><path d="M-12 4 H0 M4 -4 H14 M-2 11 H8" stroke="#B07B38" stroke-width="2" stroke-linecap="round"/></g>`;
  },
  berry() {
    const p = [[-8, -6], [6, -8], [-1, 4], [-12, 8], [10, 5], [2, 16]];
    return `<g>${leaf(0, -22, -80, 0.8, '#2F9E44')}${leaf(0, -22, -100, 0.8, '#37B96B')}${p.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8.4" fill="#C2185B"/><circle cx="${x - 2.4}" cy="${y - 2.6}" r="1.8" fill="#f48fb1"/>`).join('')}</g>`;
  },
  coconut() {
    return `<g><circle r="22" fill="#6D4A2B"/><path d="M-22 4 A22 22 0 0 0 22 4 Z" fill="#fff"/><ellipse cx="-7" cy="-9" rx="3" ry="3.6" fill="#3c2a1a"/><ellipse cx="5" cy="-9" rx="3" ry="3.6" fill="#3c2a1a"/><ellipse cx="-1" cy="-1" rx="2.6" ry="3" fill="#3c2a1a"/></g>`;
  },
  cap({ fill = '#fff' }) { // generic "sparkle" star burst
    let s = '';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const [x1, y1] = pt(24, a), [x2, y2] = pt(11, a + Math.PI / 8), [x3, y3] = pt(11, a - Math.PI / 8);
      s += `<path d="M${num(x2)} ${num(y2)} L${num(x1)} ${num(y1)} L${num(x3)} ${num(y3)} Z" fill="${fill}"/>`;
    }
    return `<g>${s}<circle r="11" fill="${fill}"/></g>`;
  },
  ice() {
    return `<g><rect x="-17" y="-17" width="34" height="34" rx="7" fill="#fff" fill-opacity=".55" stroke="#fff" stroke-width="2"/><path d="M-9 -9 L-3 -11 M-10 4 L-10 -2" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>`;
  },
};

export function icon(name, props = {}) {
  const f = ICONS[name];
  if (!f) throw new Error('unknown icon ' + name);
  return f(props);
}

export { lighten, darken };
