// Scene definitions for the hero / banner / blog / about images. Rendered by `node scripts/render/render.mjs scenes`.
import { buildProducts } from '../catalog.mjs';

const P = Object.fromEntries(buildProducts().map((p) => [p.handle, p.render]));
const can = (handle, extra = {}) => {
  if (!P[handle]) throw new Error('unknown product ' + handle);
  return { ...P[handle], ...extra };
};
const H = {
  coke: 'coca-cola-original-250ml-can', cokezero: 'coke-zero-sugar-250ml-can', pepsi: 'pepsi-250ml-can', sprite: 'sprite-250ml-can', sevenup: '7up-250ml-can',
  mirinda: 'mirinda-orange-250ml-can', fanta: 'fanta-orange-250ml-can', dew: 'mountain-dew-250ml-can', clemon: 'clemon-lemon-soda-250ml-can',
  mojito: 'clemon-mojito-250ml-can', mojo: 'mojo-cola-250ml-can', speed: 'speed-energy-drink-250ml-can', redbull: 'red-bull-energy-drink-250ml-can',
  rani: 'rani-float-grape-240ml-can', houston: 'houston-soft-drink-250ml-can', tiger: 'royal-tiger-energy-250ml-can', naga: 'naga-mojo-250ml-can',
};

// evenly spaced row, centre can a little larger and forward, outer cans turned slightly towards the middle
function row(names, { pitch = 60, centerScale = 1.1, yawStep = 5, tiltStep = 0, depth = 14 } = {}) {
  const n = names.length, mid = (n - 1) / 2;
  return names.map((nm, i) => {
    const d = i - mid, isCenter = Math.abs(d) < 0.6;
    return can(H[nm] || nm, { x: d * pitch, z: -Math.abs(d) * depth + (isCenter ? 22 : 0), scale: isCenter ? centerScale : 1, yaw: -d * yawStep + (i % 2 ? 2 : -2), tilt: d * tiltStep });
  });
}

const cam = (o = {}) => ({ fov: 20, elevation: 7, fillH: 0.9, fillV: 0.88, ...o });

export const SCENES = [
  // ---------------------------------------------------------------- blog covers (960x600)
  { name: 'blog-1', w: 960, h: 600, job: { cans: row(['fanta', 'mirinda', 'clemon', 'mojo'], { pitch: 64 }), bg: { stops: ['#ffcaa6', '#ff9d6e'], angle: 90, stripes: { color: 'rgba(255,255,255,.16)', angle: 72 }, floor: { at: 0.8, to: 'rgba(120,40,0,.18)' } }, camera: cam() } },
  { name: 'blog-2', w: 960, h: 600, job: { cans: row(['pepsi', 'sprite', 'dew', 'sevenup'], { pitch: 64 }), bg: { stops: ['#ffd95a', '#f5b81c'], angle: 90, stripes: { color: 'rgba(255,255,255,.18)', angle: 72 }, floor: { at: 0.8, to: 'rgba(120,70,0,.18)' } }, camera: cam() } },
  { name: 'blog-3', w: 960, h: 600, job: { cans: row(['coke', 'rani', 'cokezero', 'redbull'], { pitch: 64 }), bg: { stops: ['#ff8fbd', '#f0568f'], angle: 90, stripes: { color: 'rgba(255,255,255,.16)', angle: 72 }, floor: { at: 0.8, to: 'rgba(110,0,50,.2)' } }, camera: cam() } },
  { name: 'blog-4', w: 960, h: 600, job: { cans: row(['speed', 'redbull', 'dew'], { pitch: 66, centerScale: 1.1 }), bg: { stops: ['#7fd0ff', '#33a6ea'], angle: 90, stripes: { color: 'rgba(255,255,255,.18)', angle: 72 }, floor: { at: 0.8, to: 'rgba(0,50,110,.2)' } }, camera: cam() } },
  { name: 'blog-5', w: 960, h: 600, job: { cans: row(['mojito', 'clemon', 'sprite'], { pitch: 66, centerScale: 1.1 }), bg: { stops: ['#a8e6a1', '#5cc56a'], angle: 90, stripes: { color: 'rgba(255,255,255,.18)', angle: 72 }, floor: { at: 0.8, to: 'rgba(0,70,20,.2)' } }, camera: cam() } },
  { name: 'blog-6', w: 960, h: 600, job: { cans: row(['coke', 'fanta', 'sprite', 'pepsi', 'mojo'], { pitch: 58 }), bg: { stops: ['#c9a2f2', '#9156d8'], angle: 90, stripes: { color: 'rgba(255,255,255,.16)', angle: 72 }, floor: { at: 0.8, to: 'rgba(50,0,100,.22)' } }, camera: cam() } },
  // ---------------------------------------------------------------- about + banners
  { name: 'about-scene', w: 1140, h: 960, job: { cans: row(['mirinda', 'coke', 'sprite'], { pitch: 70, centerScale: 1.12, yawStep: 7 }), bg: { stops: ['#ffd95a', '#f3b516'], angle: 90, stripes: { color: 'rgba(255,255,255,.2)', angle: 72 }, floor: { at: 0.82, to: 'rgba(120,70,0,.2)' } }, camera: cam({ fillH: 0.84, fillV: 0.84 }) } },
  { name: 'banner-cans', w: 1424, h: 852, job: { cans: row(['fanta', 'sprite', 'coke', 'pepsi', 'mirinda'], { pitch: 62, centerScale: 1.12 }), bg: { stops: ['#ffd95a', '#f3b516'], angle: 90, rays: { n: 22, color: 'rgba(255,255,255,.13)', at: [0.5, 0.55] }, floor: { at: 0.82, to: 'rgba(120,70,0,.22)' } }, camera: cam({ fillH: 0.92, fillV: 0.86 }) } },
];

// ---------------------------------------------------------------- hero fans with ice + fruit (1128x1210)
function fan(names, { spread = 60, tilt = 6, yaw = 8 } = {}) {
  const n = names.length, mid = (n - 1) / 2;
  return names.map((nm, i) => {
    const d = i - mid, c = Math.abs(d) < 0.6;
    return can(H[nm] || nm, { x: d * spread, z: -Math.abs(d) * 16 + (c ? 42 : 0), scale: c ? 1.16 : 1 - Math.abs(d) * 0.02, yaw: -d * yaw, tilt: -d * tilt });
  });
}
function ice(n, { xr = 190, z0 = 62, z1 = 150, s0 = 20, s1 = 30, seed = 4 } = {}) {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, () => { const size = s0 + rnd() * (s1 - s0); return { type: 'ice', s: size, x: (rnd() - 0.5) * 2 * xr, y: size / 2, z: z0 + rnd() * (z1 - z0), ry: rnd() * 90, rx: rnd() * 14, rz: rnd() * 14 }; });
}
function bubbles(n, { seed = 3, xr = 120, y0 = 25, y1 = 215 } = {}) {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, () => ({ type: 'bubble', s: 2.5 + rnd() * rnd() * 9, x: (rnd() - 0.5) * 2 * xr, y: y0 + rnd() * (y1 - y0), z: -20 + rnd() * 150 }));
}
const slices = (kinds, base) => kinds.map((k, i) => ({ type: 'fruit', fruit: k, ...base[i] }));

SCENES.push(
  { name: 'hero-1', w: 1128, h: 1210, job: {
    cans: fan(['dew', 'sprite', 'coke', 'fanta', 'pepsi'], { spread: 56 }),
    props: [...bubbles(22, { seed: 5 }), ...slices(['lime', 'lime', 'lemon', 'lime'], [
      { s: 30, x: -92, y: 200, z: -30, rx: 78, rz: 20 }, { s: 26, x: 96, y: 212, z: -30, rx: 78, rz: -25 }, { s: 24, x: 98, y: 24, z: 100, rx: 62, rz: 10 }, { s: 22, x: -92, y: 22, z: 106, rx: 64, rz: -12 }])],
    bg: { stops: ['#f1fbdd', '#cdeea0'], angle: 90, bokeh: 12, floor: { at: 0.8, to: 'rgba(60,110,10,.18)' } },
    camera: { fov: 20, elevation: 8, fillH: 0.9, fillV: 0.9 }, fitBox: { min: [-118, -5, -30], max: [118, 228, 150] } } },
  { name: 'hero-2', w: 1128, h: 1210, job: {
    cans: fan(['mirinda', 'fanta', 'dew', 'mojito', 'sevenup'], { spread: 56 }),
    props: [...bubbles(22, { seed: 9 }), ...slices(['orange', 'lemon', 'orange', 'lime'], [
      { s: 30, x: -92, y: 205, z: -30, rx: 78, rz: 20 }, { s: 26, x: 96, y: 210, z: -30, rx: 78, rz: -25 }, { s: 24, x: 98, y: 24, z: 104, rx: 62, rz: 10 }, { s: 22, x: -92, y: 22, z: 104, rx: 64, rz: -12 }])],
    bg: { stops: ['#fff4e4', '#ffd6a6'], angle: 90, bokeh: 12, floor: { at: 0.8, to: 'rgba(150,70,0,.18)' } },
    camera: { fov: 20, elevation: 8, fillH: 0.9, fillV: 0.9 }, fitBox: { min: [-118, -5, -30], max: [118, 228, 150] } } },
);

// ---------------------------------------------------------------- wide "parade" banner behind the animated strips (2800x1080)
SCENES.push({ name: 'strips', w: 2800, h: 1080, job: {
  cans: [['coke', -262, -7], ['fanta', -157, 6], ['sprite', -52, -5], ['pepsi', 52, 6], ['speed', 157, -6], ['mirinda', 262, 7]].map(([nm, x, tilt], i) => can(H[nm], { x, z: (i % 2) * 24, scale: 1.14, tilt, yaw: (i % 2 ? 8 : -8) })),
  bg: { stops: ['#ffffff', '#ffffff'], bands: { colors: ['#FFD23F', '#FF6FA8', '#FF9F43', '#4DB6E8', '#7BD389', '#B57BE0', '#FFD23F', '#FF6FA8', '#FF9F43', '#4DB6E8', '#7BD389', '#B57BE0'], dots: { color: 'rgba(255,255,255,.3)', r: 7, step: 34 } } },
  camera: { fov: 20, elevation: 6, fillH: 0.96, fillV: 0.9 }, shadows: true } });
