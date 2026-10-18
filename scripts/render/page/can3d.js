// Photoreal aluminium can model + studio environment (three.js). Units are millimetres.
import * as THREE from 'three';

export const KINDS = {
  slim: { R: 26.5, H: 134, neck: 0.885, label: 'Slim 250 ml' },
  mini: { R: 26.5, H: 106, neck: 0.885, label: 'Mini 240 ml' },
  std: { R: 33.0, H: 115, neck: 0.835, label: 'Standard 330 ml' },
  tall: { R: 33.0, H: 168, neck: 0.835, label: 'Tall 500 ml' },
};

// corner-cutting keeps the profile smooth without losing the ends
function chaikin(pts, iterations = 2) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}
const V = (pts) => pts.map((p) => new THREE.Vector2(Math.max(0, p[0]), p[1]));

export function profiles(kind) {
  const { R, H, neck } = KINDS[kind];
  const Rn = R * neck;
  const bottom = chaikin([
    [0.0, 6.4], [R * 0.3, 6.1], [R * 0.52, 5.0], [R * 0.66, 3.1], [R * 0.72, 1.3], [R * 0.76, 0.35], [R * 0.80, 0.0], [R * 0.84, 0.12],
    [R * 0.87, 0.9], [R * 0.905, 2.5], [R * 0.955, 4.3], [R * 0.99, 5.6], [R, 6.6],
  ], 2);
  const body = chaikin([
    [R, 6.6], [R, 9], [R, H - 22], [R * 0.999, H - 17], [R * 0.99, H - 14], [R * 0.965, H - 11.6], [R * 0.93, H - 9.6], [(R + Rn) / 2 + 0.2, H - 8.2], [Rn, H - 7.2],
  ], 1);
  const top = chaikin([
    [Rn, H - 7.2], [Rn - 0.4, H - 5.4], [Rn - 0.2, H - 3.7], [Rn + 0.55, H - 2.5], [Rn + 1.25, H - 1.35], [Rn + 1.4, H - 0.45], [Rn + 1.0, H + 0.12],
    [Rn + 0.15, H + 0.1], [Rn - 0.8, H - 0.6], [Rn - 1.15, H - 2.0], [Rn - 1.8, H - 2.95], [Rn - 3.0, H - 3.3],
  ], 2);
  return { bottom: V(bottom), body: V(body), top: V(top), R, H, Rn };
}

function canvasTex(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; }
  return t;
}

// ---- lid: stamped grooves + score line, as colour + bump maps
function lidMaps() {
  const draw = (ctx, w, h, bump) => {
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = bump ? '#808080' : '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const ring = (r, lw, v) => { ctx.beginPath(); ctx.arc(cx, cy, r * w / 2, 0, Math.PI * 2); ctx.lineWidth = lw; ctx.strokeStyle = v; ctx.stroke(); };
    if (bump) {
      ring(0.97, 9, '#303030'); ring(0.84, 7, '#d0d0d0'); ring(0.74, 5, '#404040');
      ctx.save(); ctx.translate(cx, cy + h * 0.16); ctx.beginPath(); ctx.ellipse(0, 0, w * 0.2, h * 0.14, 0, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = '#282828'; ctx.stroke(); ctx.restore();
    } else {
      ring(0.97, 7, '#9a9fa8'); ring(0.84, 4, '#f4f6f9'); ring(0.74, 4, '#aeb3bb');
      ctx.save(); ctx.translate(cx, cy + h * 0.16); ctx.beginPath(); ctx.ellipse(0, 0, w * 0.2, h * 0.14, 0, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = '#8b9099'; ctx.stroke(); ctx.restore();
    }
  };
  return { map: canvasTex(1024, 1024, (c, w, h) => draw(c, w, h, false)), bump: canvasTex(1024, 1024, (c, w, h) => draw(c, w, h, true), { srgb: false }) };
}

function tabMesh(mat, scale) {
  const s = new THREE.Shape();
  s.moveTo(-4.4, -9.5); s.lineTo(4.4, -9.5); s.quadraticCurveTo(7, -9.5, 7.4, -6.8); s.lineTo(8.4, 4.5);
  s.bezierCurveTo(8.9, 10, 6, 13.4, 0, 13.4); s.bezierCurveTo(-6, 13.4, -8.9, 10, -8.4, 4.5); s.lineTo(-7.4, -6.8); s.quadraticCurveTo(-7, -9.5, -4.4, -9.5);
  const hole = new THREE.Path(); hole.absellipse(0, 6.8, 4.7, 4.0, 0, Math.PI * 2, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.3, bevelSegments: 3, curveSegments: 24 });
  const m = new THREE.Mesh(g, mat);
  m.rotation.x = Math.PI / 2;
  m.scale.setScalar(scale);
  return m;
}

// condensation: draws beads of water into a colour overlay and a bump map
export function droplets(ctx, bctx, W, H, { count = 600, seed = 7, density = 1, minR = 4, maxR = 26 } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = Math.round(count * density);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H;
    const big = rnd() < 0.035;
    const r = big ? minR + (maxR - minR) * (0.55 + rnd() * 0.45) : minR + Math.pow(rnd(), 2.4) * (maxR - minR) * 0.55;
    const rx = r, ry = r * (1.05 + rnd() * 0.35); // beads sag a little
    for (const dx of [0, -W, W]) {
      ctx.save(); ctx.translate(x + dx, y);
      // soft contact shadow below the bead
      let g = ctx.createRadialGradient(r * 0.25, ry * 0.55, 0, r * 0.25, ry * 0.55, ry * 1.5);
      g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(r * 0.25, ry * 0.55, rx * 1.4, ry * 1.4, 0, 0, Math.PI * 2); ctx.fill();
      // bead body: lens of lightened colour with dark lower rim
      g = ctx.createRadialGradient(-rx * 0.25, -ry * 0.3, rx * 0.05, 0, 0, ry);
      g.addColorStop(0, 'rgba(255,255,255,0.30)'); g.addColorStop(0.55, 'rgba(255,255,255,0.08)'); g.addColorStop(0.85, 'rgba(0,0,0,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.26)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      // specular glints
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(-rx * 0.38, -ry * 0.42, rx * 0.2, ry * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(rx * 0.35, ry * 0.45, rx * 0.12, ry * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (bctx) {
        bctx.save(); bctx.translate(x + dx, y);
        const b = bctx.createRadialGradient(0, 0, 0, 0, 0, ry);
        b.addColorStop(0, '#ffffff'); b.addColorStop(0.7, '#d8d8d8'); b.addColorStop(1, '#808080');
        bctx.fillStyle = b; bctx.beginPath(); bctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); bctx.fill(); bctx.restore();
      }
    }
  }
}

export function buildCan({ kind = 'slim', labelCanvas, bumpCanvas, tint = 0xd9dce1, flake = 0.5, gloss = 0.2 }) {
  const P = profiles(kind);
  const { R, H, Rn } = P;
  const group = new THREE.Group();

  const alu = new THREE.MeshStandardMaterial({ color: tint, metalness: 1, roughness: 0.27, envMapIntensity: 1.25 });
  const aluDark = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, metalness: 1, roughness: 0.38, envMapIntensity: 1.1 });

  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  labelTex.anisotropy = 16;
  labelTex.wrapS = THREE.RepeatWrapping;
  labelTex.offset.x = 0.5; // texture centre faces the camera (+Z)
  const printed = new THREE.MeshPhysicalMaterial({
    map: labelTex, metalness: flake, roughness: 0.34, clearcoat: 1, clearcoatRoughness: gloss, envMapIntensity: 1.05,
  });
  if (bumpCanvas) {
    const bt = new THREE.CanvasTexture(bumpCanvas);
    bt.wrapS = THREE.RepeatWrapping; bt.offset.x = 0.5; bt.anisotropy = 8;
    printed.bumpMap = bt; printed.bumpScale = 1.6;
  }

  const SEG = 160;
  const bot = new THREE.Mesh(new THREE.LatheGeometry(P.bottom, SEG), aluDark);
  const bodyGeo = new THREE.LatheGeometry(P.body, SEG);
  { // v = height fraction of the printed region so the label maps 1:1
    const pos = bodyGeo.attributes.position, uv = bodyGeo.attributes.uv;
    const y0 = P.body[0].y, y1 = P.body[P.body.length - 1].y;
    for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - y0) / (y1 - y0));
  }
  const body = new THREE.Mesh(bodyGeo, printed);
  const top = new THREE.Mesh(new THREE.LatheGeometry(P.top, SEG), alu);
  group.add(bot, body, top);

  // lid panel + tab + rivet
  const lm = lidMaps();
  const lidMat = new THREE.MeshStandardMaterial({ color: 0xe3e6ea, metalness: 1, roughness: 0.3, map: lm.map, bumpMap: lm.bump, bumpScale: 2.2, envMapIntensity: 1.2 });
  const lid = new THREE.Mesh(new THREE.CircleGeometry(Rn - 2.95, 96), lidMat);
  lid.rotation.x = -Math.PI / 2; lid.position.y = H - 3.3;
  group.add(lid);
  const tabScale = (Rn - 3) / 22;
  const tab = tabMesh(new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: 1, roughness: 0.22, envMapIntensity: 1.3 }), tabScale);
  tab.position.set(0, H - 3.3 + 1.1, -1.2 * tabScale);
  group.add(tab);
  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(2.1 * tabScale, 2.4 * tabScale, 1.7, 32), alu);
  rivet.position.set(0, H - 3.3 + 0.55, 0);
  group.add(rivet);

  group.userData = { R, H, kind };
  return group;
}

// ---- studio environment: dark room with softboxes, gives the long vertical highlights seen on real cans
export function studioEnvironment(renderer, { warm = 0 } = {}) {
  const envScene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.MeshBasicMaterial({
    side: THREE.BackSide, map: (() => { const t = canvasTex(8, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9aa0a8'); g.addColorStop(0.45, '#3b4048'); g.addColorStop(1, '#14161a'); c.fillStyle = g; c.fillRect(0, 0, w, h); }); return t; })(),
  }));
  envScene.add(room);
  const panel = (w, h, x, y, z, intensity, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); return m;
  };
  const w = warm ? 0xfff1e0 : 0xffffff;
  panel(16, 52, -26, 4, 22, 5.2, w);   // key: tall softbox front-left
  panel(5, 52, 30, 2, 12, 3.4);        // fill strip front-right
  panel(34, 34, 0, 36, 4, 2.4);        // overhead
  panel(3, 46, -22, 0, -28, 4.2);      // rim back-left
  panel(3, 46, 24, 0, -26, 4.6);       // rim back-right
  panel(60, 10, 0, -22, 14, 0.9);      // floor bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.015);
  pmrem.dispose();
  return rt.texture;
}

export function softShadow(radius, strength = 0.5, squash = 0.32) {
  const t = canvasTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(0.45, `rgba(0,0,0,${strength * 0.55})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, { srgb: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 3.4, radius * 3.4 * 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.scale.set(1, 1, 1); m.userData.squash = squash;
  return m;
}
