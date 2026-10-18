/* global window -- the evaluate() callbacks below run inside the renderer page, not in Node */
// Node driver for the can renderer: serves the project, opens the three.js page in headless Chrome and returns PNG buffers.
//
//   node scripts/render/render.mjs build [handle ...]   render product images  -> public/assets/img/products/*.webp
//   node scripts/render/render.mjs scenes [name ...]    render hero/blog scenes -> public/assets/img/scenes/*.webp
//   node scripts/render/render.mjs all                  both
//   node scripts/render/render.mjs sheet | packs | label <design> | test   (previews in scripts/render/out/)
//
// Real photos win: drop scripts/render/inbox/<handle>.png|jpg|webp and `build` cuts it out and uses it instead of the render.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { cutout, frame, packFromCutout, INBOX_EXT } from './ingest.mjs';
import { derivePackThumbs, deriveScenes } from './derive.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};

export function findChrome() {
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = c.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome/Chromium not found. Install Chrome or set CHROME_PATH.');
  return found;
}

export async function startRenderer({ gpu = true } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      return res.end('nope');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const args = [
    '--no-sandbox',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--allow-file-access-from-files',
    '--disable-features=Vulkan',
  ];
  if (!gpu) args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args,
    protocolTimeout: 900000,
  });
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if ((m.type() === 'error' && !/404/.test(t)) || /warn/i.test(m.type())) console.log('[page]', t.slice(0, 300));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/scripts/render/page/index.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.ready === true', { timeout: 30000 });
  const png = async (fn, arg) => Buffer.from((await page.evaluate(fn, arg)).split(',')[1], 'base64');
  return {
    info: () => page.evaluate('window.rendererInfo()'),
    render: (job) => png((j) => window.renderJob(j), job),
    scene: (job) => png((j) => window.renderScene(j), job),
    async label(design, kind = 'slim', droplets = 0, opts = {}) {
      return Buffer.from(
        (await page.evaluate((d, k, n, o) => window.renderLabel(d, k, n, o), design, kind, droplets, opts)).split(
          ',',
        )[1],
        'base64',
      );
    },
    async close() {
      await browser.close();
      server.close();
    },
  };
}

// ------------------------------------------------------------------ helpers
const webp = (buf, file, w, h, q = 88) =>
  sharp(buf)
    .resize(w, h, { kernel: 'lanczos3', fit: 'fill' })
    .webp({ quality: q, alphaQuality: 100, effort: 5 })
    .toFile(file);
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const chroma = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255];
  return Math.max(...c) - Math.min(...c);
};
const bandColor = (art) =>
  lum(art.body) > 205 || (lum(art.body) < 60 && chroma(art.body) < 45) ? art.accent : art.body;

async function fitPack(png, W = 900, H = 700) {
  const t = await sharp(png)
    .trim({ threshold: 8 })
    .resize({ width: Math.round(W * 0.95), height: Math.round(H * 0.93), fit: 'inside' })
    .toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: t.data, left: Math.round((W - t.info.width) / 2), top: Math.round((H - t.info.height) / 2) }])
    .png()
    .toBuffer();
}

function inboxFile(handle) {
  for (const e of INBOX_EXT) {
    const f = path.join(ROOT, 'scripts', 'render', 'inbox', handle + e);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

async function buildProduct(r, p, outDir) {
  const base = path.join(outDir, p.handle);
  const photo = inboxFile(p.handle);
  let single, angle;
  const packs = {};
  if (photo) {
    const cut = await cutout(photo);
    single = await frame(cut, 1400, 2100);
    angle = single;
    for (const n of [6, 12, 24]) packs[n] = await fitPack(await packFromCutout(cut, n));
  } else {
    single = await r.render({ ...p.render, w: 1400, h: 2100, droplets: 0.85 });
    angle = await r.render({ ...p.render, w: 1400, h: 2100, droplets: 0.85, yaw: -22, elevation: 12 });
    for (const n of [6, 12, 24]) {
      const png = await r.scene({
        type: 'pack',
        n,
        design: p.render.design,
        kind: p.render.kind,
        opts: p.render.opts,
        droplets: 0.8,
        title: p.brand,
        bandColor: bandColor(p.art),
        w: 1800,
        h: 1300,
        camera: { elevation: n === 24 ? 30 : n === 12 ? 22 : 16, fov: 16 },
      });
      packs[n] = await fitPack(png);
    }
  }
  await webp(single, `${base}.webp`, 700, 1050, 90);
  await webp(single, `${base}-card.webp`, 380, 570, 86);
  await webp(single, `${base}-thumb.webp`, 150, 225, 82);
  await webp(angle, `${base}-angle.webp`, 700, 1050, 88);
  for (const n of [6, 12, 24])
    await sharp(packs[n]).webp({ quality: 86, alphaQuality: 100, effort: 5 }).toFile(`${base}-pack${n}.webp`);
  return photo ? 'photo' : 'render';
}

async function buildScenes(r, only) {
  const { SCENES } = await import('./scenes.mjs');
  const dir = path.join(ROOT, 'public', 'assets', 'img', 'scenes');
  fs.mkdirSync(dir, { recursive: true });
  for (const sc of SCENES.filter((x) => !only.length || only.includes(x.name))) {
    const t = Date.now();
    const png = await r.scene({ ...sc.job, w: sc.w * 2, h: sc.h * 2 });
    await sharp(png)
      .resize(sc.w, sc.h, { kernel: 'lanczos3' })
      .flatten({ background: '#ffffff' })
      .webp({ quality: 88, effort: 5 })
      .toFile(path.join(dir, `${sc.name}.webp`));
    console.log('scene', sc.name.padEnd(14), `${Date.now() - t} ms`);
  }
}

// ------------------------------------------------------------------ CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd = 'test', ...args] = process.argv.slice(2);
  const out = path.join(ROOT, 'scripts', 'render', 'out');
  fs.mkdirSync(out, { recursive: true });
  const r = await startRenderer({ gpu: process.env.RENDER_SWIFTSHADER !== '1' });
  console.log('renderer:', (await r.info()).gl);
  const { buildProducts } = await import('../catalog.mjs');

  if (cmd === 'build' || cmd === 'all') {
    const dir = path.join(ROOT, 'public', 'assets', 'img', 'products');
    fs.mkdirSync(dir, { recursive: true });
    const list = buildProducts().filter((p) => cmd === 'all' || !args.length || args.includes(p.handle));
    const t0 = Date.now();
    for (const [i, p] of list.entries()) {
      const t = Date.now();
      const kind = await buildProduct(r, p, dir);
      console.log(
        `${String(i + 1).padStart(2)}/${list.length} ${p.handle.padEnd(38)} ${kind}  ${((Date.now() - t) / 1000).toFixed(1)}s`,
      );
    }
    console.log(`products done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    console.log(`small pack thumbnails written: ${await derivePackThumbs()}`);
  }
  if (cmd === 'scenes' || cmd === 'all') {
    await buildScenes(r, cmd === 'all' ? [] : args);
    console.log(`scene sizes written: ${await deriveScenes()}`);
  }

  if (cmd === 'label') {
    const [design, kind = 'slim'] = args;
    fs.writeFileSync(path.join(out, `label-${design}.png`), await r.label(design, kind));
  }
  if (cmd === 'packs') {
    for (const n of [6, 12, 24])
      fs.writeFileSync(
        path.join(out, `pack-${n}.png`),
        await r.scene({
          type: 'pack',
          n,
          design: 'coke',
          kind: 'slim',
          opts: { ml: '250 mL' },
          w: 1400,
          h: 1000,
          title: 'Coca-Cola',
          bandColor: '#d3151f',
          camera: { elevation: n === 24 ? 30 : n === 12 ? 22 : 16, fov: 16 },
        }),
      );
  }
  if (cmd === 'sheet') {
    const seen = new Set();
    const list = [];
    for (const p of buildProducts()) {
      const k = JSON.stringify(p.render);
      if (!seen.has(k)) {
        seen.add(k);
        list.push(p);
      }
    }
    const W = 280,
      H = 420,
      COLS = 7,
      rows = Math.ceil(list.length / COLS),
      comps = [];
    for (const [i, p] of list.entries()) {
      const png = await r.render({ ...p.render, w: 560, h: 840 });
      const img = await sharp(png)
        .resize(W - 10, H - 40, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const x = (i % COLS) * W,
        y = Math.floor(i / COLS) * H;
      const label = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="30"><text x="8" y="19" font-family="Arial" font-size="13" font-weight="bold" fill="#222">${p.render.design} · ${p.render.kind}${p.render.opts.latin ? ' · latin' : ''}${p.render.opts.flavor ? ' · ' + p.render.opts.flavor : ''}</text></svg>`,
      );
      comps.push({ input: img, left: x + 5, top: y + 5 }, { input: label, left: x, top: y + H - 32 });
    }
    await sharp({ create: { width: COLS * W, height: rows * H, channels: 3, background: '#e8e4dc' } })
      .composite(comps)
      .jpeg({ quality: 88 })
      .toFile(path.join(out, 'sheet.jpg'));
    console.log('sheet written');
  }
  if (cmd === 'test') {
    for (const [name, job] of [
      ['test-coke', { design: 'coke', kind: 'slim', w: 900, h: 1500 }],
      ['test-pepsi', { design: 'pepsi', kind: 'slim', w: 900, h: 1500 }],
    ]) {
      fs.writeFileSync(path.join(out, name + '.png'), await r.render(job));
    }
  }
  await r.close();
}
