// Flat, friendly team avatars (illustrated — not photographs) for the About page.
import { canGroup } from './can.mjs';
import { svgDoc, num, darken, lighten } from './lib.mjs';

function hairBack(style, hair, cloth) {
  switch (style) {
    case 'long': return `<path d="M96 262 C78 120 140 92 200 92 C260 92 322 120 304 262 L318 430 C270 452 130 452 82 430 Z" fill="${hair}"/>`;
    case 'hijab': return `<path d="M78 262 C66 108 138 78 200 78 C262 78 334 108 322 262 C326 336 304 392 262 410 L138 410 C96 392 74 336 78 262 Z" fill="${cloth}"/>`;
    default: return '';
  }
}
function hairFront(style, hair, cloth) {
  switch (style) {
    case 'short': return `<path d="M118 224 C112 128 168 104 200 104 C242 104 290 128 282 224 C270 176 236 156 200 156 C164 156 130 176 118 224 Z" fill="${hair}"/>`;
    case 'curly': return `<g fill="${hair}"><circle cx="140" cy="158" r="34"/><circle cx="178" cy="130" r="38"/><circle cx="224" cy="130" r="38"/><circle cx="262" cy="158" r="34"/><circle cx="130" cy="200" r="26"/><circle cx="270" cy="200" r="26"/></g>`;
    case 'long': return `<path d="M120 226 C122 142 170 118 200 118 C236 118 282 142 280 226 C262 178 232 160 200 160 C170 160 138 178 120 226 Z" fill="${hair}"/>`;
    case 'hijab': return `<path d="M132 214 C140 150 170 128 200 128 C232 128 262 150 268 214" fill="none" stroke="${cloth}" stroke-width="30" stroke-linecap="round"/>`;
    default: return '';
  }
}

export function avatarSvg({ bg = '#FFE7B8', skin = '#E9B08A', hair = '#2B1B14', style = 'short', shirt = '#11704B', cloth = '#E0FA63', glasses = false, beard = false, can, seed = 1 }) {
  const shade = darken(skin, 0.12);
  const { defs, content, geom } = canGroup({ ...can, droplets: 14, lite: true }, 'k');
  const face = style === 'hijab'
    ? `<ellipse cx="200" cy="244" rx="68" ry="84" fill="${skin}"/><ellipse cx="200" cy="244" rx="68" ry="84" fill="none" stroke="${cloth}" stroke-width="16"/>`
    : `<ellipse cx="200" cy="238" rx="80" ry="94" fill="${skin}"/><circle cx="121" cy="248" r="15" fill="${skin}"/><circle cx="279" cy="248" r="15" fill="${skin}"/>`;
  const body = `
<defs>${defs}${content}</defs>
<rect width="400" height="500" fill="${bg}"/>
<circle cx="200" cy="230" r="190" fill="${lighten(bg, 0.45)}"/>
<path d="M40 500 C 40 404 112 366 200 366 C 288 366 360 404 360 500 Z" fill="${shirt}"/>
<path d="M170 366 L200 410 L230 366 Z" fill="${shade}"/>
<rect x="168" y="300" width="64" height="74" rx="22" fill="${shade}"/>
${hairBack(style, hair, cloth)}
${face}
${hairFront(style, hair, cloth)}
${beard ? `<path d="M138 262 C140 330 170 352 200 352 C230 352 262 330 262 262 C250 296 228 308 200 308 C172 308 150 296 138 262 Z" fill="${hair}"/>` : ''}
<ellipse cx="170" cy="240" rx="7.5" ry="10" fill="#2b1a12"/><ellipse cx="230" cy="240" rx="7.5" ry="10" fill="#2b1a12"/>
<path d="M155 218 Q170 210 185 218 M215 218 Q230 210 245 218" fill="none" stroke="${hair}" stroke-width="5" stroke-linecap="round"/>
<path d="M174 286 Q200 314 226 286" fill="none" stroke="#8a3b2b" stroke-width="5.5" stroke-linecap="round"/>
<circle cx="150" cy="272" r="13" fill="#ff7a7a" opacity=".28"/><circle cx="250" cy="272" r="13" fill="#ff7a7a" opacity=".28"/>
${glasses ? `<g fill="none" stroke="#1d1d1d" stroke-width="5"><circle cx="170" cy="240" r="26"/><circle cx="230" cy="240" r="26"/><path d="M196 238 H204"/></g>` : ''}
<g transform="translate(300 438) rotate(10) scale(${num(0.95)}) translate(0 ${num(-geom.base)})"><use href="#k"/></g>
<ellipse cx="316" cy="416" rx="40" ry="30" fill="${skin}"/><ellipse cx="294" cy="398" rx="14" ry="22" fill="${skin}" transform="rotate(-28 294 398)"/>`;
  return svgDoc([0, 0, 400, 500], body, { width: 400, height: 500, par: 'xMidYMid slice' });
}
