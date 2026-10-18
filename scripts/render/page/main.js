// Render jobs for the can pipeline. The Node driver (scripts/render/render.mjs) calls window.renderJob(job) and receives a PNG data URL.
import * as THREE from 'three';
import { buildCan, studioEnvironment, KINDS } from './can3d.js';
import { drawLabel, loadFonts } from './labels.js';
import { buildScene, clearCans, disposeTree as disposeScene } from './scenes.js';

let renderer, envTex, fontsReady;

function init(w, h) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    document.body.appendChild(renderer.domElement);
    envTex = studioEnvironment(renderer);
  }
  renderer.setSize(w, h, false);
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of [].concat(o.material)) {
        for (const k of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'alphaMap']) if (m[k]) m[k].dispose();
        m.dispose();
      }
    }
  });
}

function frameCamera(w, h, { R, H }, { elevation = 9, fill = 0.92, fov = 14, yOffset = 0 } = {}) {
  const el = (elevation * Math.PI) / 180;
  const camera = new THREE.PerspectiveCamera(fov, w / h, 10, 6000);
  const needH = (H * Math.cos(el) + 2 * R * Math.sin(el)) / fill;
  const dist = needH / (2 * Math.tan((fov * Math.PI) / 360));
  const target = new THREE.Vector3(0, H / 2 + yOffset, 0);
  camera.position.set(0, target.y + dist * Math.sin(el), dist * Math.cos(el));
  camera.lookAt(target);
  return camera;
}

window.renderJob = async (job) => {
  fontsReady ||= loadFonts();
  await fontsReady;
  const {
    kind = 'slim',
    design,
    opts = {},
    w = 1000,
    h = 1500,
    elevation = 11,
    yaw = 0,
    tilt = 0,
    fill = 0.92,
    droplets = 1,
    seed = 7,
    flake = 0.2,
    gloss = 0.2,
  } = job;
  init(w, h);
  const scene = new THREE.Scene();
  scene.environment = envTex;
  const label = drawLabel(design, kind, { dropletDensity: droplets, seed, opts });
  const can = buildCan({ kind, labelCanvas: label.labelCanvas, bumpCanvas: label.bumpCanvas, flake, gloss });
  can.rotation.y = (yaw * Math.PI) / 180;
  can.rotation.z = (tilt * Math.PI) / 180;
  scene.add(can);
  const camera = frameCamera(w, h, KINDS[kind], { elevation, fill });
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  disposeTree(scene);
  return url;
};

window.renderScene = async (job) => {
  fontsReady ||= loadFonts();
  await fontsReady;
  const { w = 1200, h = 900 } = job;
  init(w, h);
  const { scene, camera } = buildScene(job, envTex, w, h);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  disposeScene(scene);
  if (scene.background) scene.background.dispose();
  clearCans();
  return url;
};

window.renderLabel = async (design, kind = 'slim', droplets = 0, opts = {}) => {
  fontsReady ||= loadFonts();
  await fontsReady;
  const l = drawLabel(design, kind, { dropletDensity: droplets, opts });
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = Math.round((2048 * l.H) / l.W);
  c.getContext('2d').drawImage(l.labelCanvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
};

window.rendererInfo = () => {
  init(8, 8);
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    gl: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxSamples: gl.getParameter(gl.MAX_SAMPLES),
  };
};
window.ready = true;
