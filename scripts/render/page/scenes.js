// Multi-can compositions: packs, cartons and styled hero / banner / blog scenes (three.js).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildCan, KINDS } from './can3d.js';
import { drawLabel, makeG, slice, FRUIT, PX } from './labels.js';

const canCache = new Map();

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) { for (const k of ['map', 'bumpMap', 'normalMap', 'alphaMap']) if (m[k]) m[k].dispose(); m.dispose(); }
  });
}
export function clearCans() { for (const c of canCache.values()) disposeTree(c); canCache.clear(); }

export function getCan(spec, size = 4096) {
  const key = JSON.stringify([spec.design, spec.kind, spec.opts || {}, spec.seed || 7, spec.droplets ?? 1, size]);
  let c = canCache.get(key);
  if (!c) {
    const label = drawLabel(spec.design, spec.kind, { dropletDensity: spec.droplets ?? 1, seed: spec.seed || 7, size, opts: spec.opts || {} });
    c = buildCan({ kind: spec.kind, labelCanvas: label.labelCanvas, bumpCanvas: label.bumpCanvas, flake: 0.2, gloss: 0.2 });
    c.userData.labelCanvas = label.labelCanvas;
    canCache.set(key, c);
  }
  const clone = c.clone();
  clone.userData = { ...c.userData };
  return clone;
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ------------------------------------------------------------------ backdrops
export function backdropTexture(bg, w, h) {
  return canvasTex(w, h, (ctx) => {
    const ang = ((bg.angle ?? 90) * Math.PI) / 180;
    const gx = Math.cos(ang) * w, gy = Math.sin(ang) * h;
    const gr = ctx.createLinearGradient(w / 2 - gx / 2, h / 2 - gy / 2, w / 2 + gx / 2, h / 2 + gy / 2);
    (bg.stops || ['#fff', '#eee']).forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    if (bg.rays) { // soft sunburst from a point
      const [rx, ry] = bg.rays.at || [0.5, 0.5]; const n = bg.rays.n || 18;
      ctx.save(); ctx.translate(w * rx, h * ry); ctx.fillStyle = bg.rays.color || 'rgba(255,255,255,.12)';
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832, b = a + (6.2832 / n) * 0.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * w * 1.5, Math.sin(a) * w * 1.5); ctx.lineTo(Math.cos(b) * w * 1.5, Math.sin(b) * w * 1.5); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    if (bg.stripes) { // diagonal bands like the theme's playful backdrops
      const { color = 'rgba(255,255,255,.14)', width: sw = 0.09, angle = 70, gap = 0.18 } = bg.stripes;
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(((angle - 90) * Math.PI) / 180); ctx.fillStyle = color;
      const span = Math.hypot(w, h);
      for (let x = -span; x < span; x += span * gap) ctx.fillRect(x, -span, span * sw, span * 2);
      ctx.restore();
    }
    if (bg.bands) { // vertical colour strips (the "parade" banner)
      const { colors, dots } = bg.bands, bw = w / colors.length;
      colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, 0, bw + 1, h); });
      if (dots) { ctx.fillStyle = dots.color || 'rgba(255,255,255,.3)'; for (let y = 0; y < h; y += dots.step || 34) for (let x = ((y / (dots.step || 34)) % 2) * (dots.step || 34) / 2; x < w; x += dots.step || 34) { ctx.beginPath(); ctx.arc(x, y, dots.r || 7, 0, 6.2832); ctx.fill(); } }
    }
    if (bg.dots) { // halftone dots
      const { color = 'rgba(255,255,255,.2)', r = 5, step = 26 } = bg.dots;
      ctx.fillStyle = color; for (let y = 0; y < h; y += step) for (let x = ((y / step) % 2) * step / 2; x < w; x += step) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
    }
    if (bg.bokeh) {
      let s = 17; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < bg.bokeh; i++) { const x = rnd() * w, y = rnd() * h * 0.8, r = (0.02 + rnd() * 0.06) * w; const g2 = ctx.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, 'rgba(255,255,255,.35)'); g2.addColorStop(0.8, 'rgba(255,255,255,.12)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
    }
    if (bg.floor) { // lighter / darker table surface in the lower part
      const f = bg.floor; const y0 = h * (f.at ?? 0.78);
      const g3 = ctx.createLinearGradient(0, y0, 0, h); g3.addColorStop(0, f.from || 'rgba(0,0,0,0)'); g3.addColorStop(1, f.to || 'rgba(0,0,0,.12)');
      ctx.fillStyle = g3; ctx.fillRect(0, y0, w, h - y0);
    }
  });
}

// ------------------------------------------------------------------ props
function shadowBlob(rx, rz, strength = 0.5) {
  const t = canvasTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(0.5, `rgba(0,0,0,${strength * 0.5})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, false);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.renderOrder = -1;
  return m;
}

function iceCube(size) {
  const geo = new RoundedBoxGeometry(size, size, size, 6, size * 0.16);
  // milky, frosted ice: part of the light is transmitted, the rest scatters off a white body
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xf4fbff, metalness: 0, roughness: 0.32, transmission: 0.8, thickness: size * 0.7, ior: 1.31, attenuationColor: new THREE.Color(0xe6f6ff), attenuationDistance: size * 4, envMapIntensity: 2.4, specularIntensity: 1, clearcoat: 0.5, clearcoatRoughness: 0.15 });
  return new THREE.Mesh(geo, mat);
}

function fruitDisc(kind, r, seg = 9) {
  const tex = canvasTex(512, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = makeG(ctx, w, h, 'slim'); // ph = 512 / 24.6
    slice(g, 0, 0.5, (w / 2 / PX) * 0.96, { ...FRUIT[kind], seg, rot: 0.3 });
  });
  const f = FRUIT[kind];
  const thick = r * 0.16;
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(f.rind), roughness: 0.5 });
  const top = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 0.35, metalness: 0 });
  const geo = new THREE.CylinderGeometry(r, r, thick, 64);
  const m = new THREE.Mesh(geo, [side, top, top]);
  return m;
}

function bubble(r) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0, thickness: r * 0.6, ior: 1.15, envMapIntensity: 1.6, transparent: false }));
}

function kraftTexture(w, h, band, title, sub) {
  return canvasTex(w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c9a46c'); g.addColorStop(1, '#b8915a'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(90,60,20,.12)'; ctx.lineWidth = 2; for (let x = 0; x < w; x += 9) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    if (band) {
      ctx.fillStyle = band; ctx.fillRect(0, h * 0.18, w, h * 0.64);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${h * 0.3}px "PoppinsXB"`; ctx.fillText(title || '', w / 2, h * 0.43);
      ctx.font = `700 ${h * 0.13}px "PoppinsB"`; ctx.fillText(sub || '', w / 2, h * 0.68);
    }
  });
}

function tray(cols, rows, pitch, canH, bandColor, title) {
  const group = new THREE.Group();
  const th = canH * 0.3, wall = 1.6, w = cols * pitch + 4, d = rows * pitch + 4;
  const plain = new THREE.MeshStandardMaterial({ map: kraftTexture(256, 64), roughness: 0.9, metalness: 0 });
  const printed = new THREE.MeshStandardMaterial({ map: kraftTexture(1400, 220, bandColor, title, 'CARTON OF 24 CANS'), roughness: 0.82, metalness: 0 });
  const mk = (bw, bh, bd, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); m.position.set(x, y, z); group.add(m); return m; };
  mk(w, 1.4, d, 0, 0.7, 0, plain);
  mk(w, th, wall, 0, th / 2, d / 2, printed); // front (printed)
  mk(w, th * 0.9, wall, 0, th * 0.45, -d / 2, plain);
  mk(wall, th * 0.92, d, w / 2, th * 0.46, 0, printed);
  mk(wall, th * 0.92, d, -w / 2, th * 0.46, 0, plain);
  return group;
}

// ------------------------------------------------------------------ camera
function fitCamera(box, aspect, { fov = 18, elevation = 8, azimuth = 0, fillH = 0.9, fillV = 0.9, shiftY = 0 } = {}) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 10, 8000);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const t = Math.tan((fov * Math.PI) / 360);
  const dist = Math.max((size.y / 2) / (t * fillV), (size.x / 2) / (t * aspect * fillH)) + size.z * 0.6;
  const el = (elevation * Math.PI) / 180, az = (azimuth * Math.PI) / 180;
  camera.position.set(center.x + dist * Math.cos(el) * Math.sin(az), center.y + dist * Math.sin(el) + shiftY, center.z + dist * Math.cos(el) * Math.cos(az));
  camera.lookAt(center.x, center.y + shiftY * 0.5, center.z);
  return camera;
}

// ------------------------------------------------------------------ scene builder
export function buildScene(job, envTex, w, h) {
  const scene = new THREE.Scene();
  scene.environment = envTex;
  const labelSize = job.labelSize || 3072;
  const root = new THREE.Group();
  scene.add(root);
  let cans = job.cans || [];

  // packs expand into a grid of cans
  if (job.type === 'pack') {
    const spec = { design: job.design, kind: job.kind, opts: job.opts, droplets: job.droplets ?? 0.8 };
    const { R, H } = KINDS[job.kind];
    const pitch = 2 * R + 1.2;
    const n = job.n, layout = { 6: [3, 2], 12: [4, 3], 24: [6, 4] }[n];
    const [cols, rows] = layout;
    cans = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const stagger = n < 24 && r % 2 ? pitch / 2 : 0;
      cans.push({ ...spec, x: (c - (cols - 1) / 2) * pitch + (n < 24 ? (r % 2 ? pitch / 4 : -pitch / 4) : 0), z: (rows - 1) / 2 * pitch * (n < 24 ? 0.88 : 1) - r * pitch * (n < 24 ? 0.88 : 1), yaw: (((c * 37 + r * 53) % 11) - 5) * 1.1, key: 1 });
      void stagger;
    }
    if (n === 24) {
      const t = tray(cols, rows, pitch, H, job.bandColor || '#d3151f', job.title || '');
      root.add(t);
    }
    root.rotation.y = ((job.groupYaw ?? (n === 24 ? -20 : -14)) * Math.PI) / 180;
  }

  const sceneBox = new THREE.Box3();
  for (const c of cans) {
    const can = getCan({ design: c.design, kind: c.kind, opts: c.opts, droplets: c.droplets ?? job.droplets ?? 0.8, seed: c.seed || 7 }, labelSize);
    const s = c.scale ?? 1;
    can.scale.setScalar(s);
    can.position.set(c.x || 0, c.y || 0, c.z || 0);
    can.rotation.set(((c.pitch || 0) * Math.PI) / 180, ((c.yaw || 0) * Math.PI) / 180, ((c.tilt || 0) * Math.PI) / 180, 'YXZ');
    root.add(can);
    if (job.shadows !== false && !(c.y > 1)) {
      const { R } = KINDS[c.kind];
      const sh = shadowBlob(R * 1.9 * s, R * 1.0 * s, job.shadowStrength ?? 0.45); sh.position.set((c.x || 0) + R * 0.55 * s, 0.06, (c.z || 0) + R * 0.25 * s); root.add(sh);
    }
  }

  // props
  for (const p of job.props || []) {
    let m;
    if (p.type === 'ice') m = iceCube(p.s || 24);
    else if (p.type === 'fruit') m = fruitDisc(p.fruit, p.s || 22, p.seg || 9);
    else if (p.type === 'bubble') m = bubble(p.s || 3);
    if (!m) continue;
    m.position.set(p.x || 0, p.y || 0, p.z || 0);
    m.rotation.set(((p.rx || 0) * Math.PI) / 180, ((p.ry || 0) * Math.PI) / 180, ((p.rz || 0) * Math.PI) / 180);
    root.add(m);
  }

  root.updateMatrixWorld(true);
  sceneBox.setFromObject(root);
  if (job.bg) scene.background = backdropTexture(job.bg, w, h);
  const cam = job.camera || {};
  const camera = fitCamera(job.fitBox ? new THREE.Box3(new THREE.Vector3(...job.fitBox.min), new THREE.Vector3(...job.fitBox.max)) : sceneBox, w / h, cam);
  return { scene, camera };
}
