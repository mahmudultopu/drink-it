/* global window, document -- the evaluate() callbacks below run inside the page, not in Node */
// Regenerates the screenshots used in the README (docs/screenshots/*.jpg).
//
//   npm run screenshots
//
// It starts the shop on a free port with a throw-away copy of data/, places a few sample orders through the API so
// the dashboard has something to show, drives headless Chrome through the key pages and writes compressed JPEGs.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { findChrome } from './chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const ADMIN_PASSWORD = 'screenshots-only-passphrase';

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function startShop() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drinkit-shots-'));
  await fs.cp(path.join(ROOT, 'data'), dataDir, { recursive: true });
  for (const f of ['orders.json', 'users.json', 'messages.json', 'subscribers.json', 'admin.json', 'secret.key']) {
    await fs.rm(path.join(dataDir, f), { force: true });
  }
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DRINKIT_DATA_DIR: dataDir,
      DRINKIT_ADMIN_PASSWORD: ADMIN_PASSWORD,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`server exited with ${code}`)));
    child.stdout.on('data', (d) => String(d).includes('is running') && resolve());
  });
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      child.kill();
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** Place a few orders and move some along, so the dashboard has numbers to show. */
async function seedOrders(base) {
  const json = { 'content-type': 'application/json' };
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...json, ...headers },
      body: body && JSON.stringify(body),
    });
    return { res, body: await res.json().catch(() => ({})) };
  };
  const login = await call('POST', '/api/admin/login', { password: ADMIN_PASSWORD });
  const cookie = login.res.headers.getSetCookie()[0].split(';')[0];

  const customers = [
    ['Nusrat Jahan', '01711000001', 'Dhaka', 'Dhaka', 'Dhanmondi', 'cod', 'coca-cola-original-250ml-can', 'pack24'],
    ['Rafiq Ahmed', '01811000002', 'Dhaka', 'Dhaka', 'Uttara', 'bkash', 'sprite-250ml-can', 'pack12'],
    ['Sadia Islam', '01911000003', 'Sylhet', 'Sylhet', 'Zindabazar', 'cod', 'fanta-orange-250ml-can', 'pack6'],
    ['Imran Hossain', '01611000004', 'Dhaka', 'Gazipur', 'Tongi', 'nagad', 'mojo-cola-250ml-can', 'pack12'],
    ['Farzana Akter', '01511000005', 'Chattogram', 'Chattogram', 'Agrabad', 'cod', 'pepsi-250ml-can', 'pack6'],
  ];
  const orders = [];
  for (const [name, phone, division, district, area, method, handle, pack] of customers) {
    const { body } = await call('POST', '/api/orders', {
      items: [{ handle, pack, qty: 1 }],
      customer: { name, phone },
      shipping: { division, district, area, address: `House 12, Road 4, ${area}` },
      payment: method === 'cod' ? { method } : { method, trxId: `TRX${phone.slice(-6)}`, sender: phone },
    });
    orders.push(body.order);
  }
  const move = (order, status) => call('PATCH', `/api/admin/orders/${order.id}`, { status }, { cookie });
  await move(orders[0], 'confirmed');
  await move(orders[0], 'packed');
  await move(orders[0], 'shipped');
  await move(orders[0], 'delivered');
  await move(orders[2], 'confirmed');
}

const shop = await startShop();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
try {
  await seedOrders(shop.base);
  await fs.mkdir(OUT, { recursive: true });

  async function shoot(name, urlPath, { width = 1440, height = 900, scale = 1, mobile = false, prepare } = {}) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument(() => {
      try {
        window.sessionStorage.setItem('drinkit.popup', '1'); // no newsletter pop-up in the picture
        window.sessionStorage.setItem('drinkit.act', '1');
      } catch {
        /* ignore */
      }
    });
    await page.goto(shop.base + urlPath, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 900));
    await prepare?.(page);
    await new Promise((r) => setTimeout(r, 700));
    const png = await page.screenshot();
    await page.close();
    return png;
  }
  const save = (name, png) =>
    sharp(png)
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(OUT, `${name}.jpg`));

  await save('home', await shoot('home', '/'));
  await save(
    'collection',
    await shoot('collection', '/collections/cola-classics', {
      prepare: (page) => page.evaluate(() => window.scrollTo(0, 520)),
    }),
  );
  await save('product', await shoot('product', '/products/coca-cola-original-250ml-can', { height: 940 }));

  // three phone screens side by side: home, product and the open cart
  const phone = { width: 390, height: 780, scale: 2, mobile: true };
  const home = await shoot('m-home', '/', phone);
  const product = await shoot('m-product', '/products/sprite-250ml-can', phone);
  const cart = await shoot('m-cart', '/products/sprite-250ml-can', {
    ...phone,
    prepare: async (page) => {
      await page.click('[data-pack="pack6"]');
      await page.click('[data-add]');
      await page.waitForFunction(() => document.querySelector('#cart-drawer')?.classList.contains('is-open'));
    },
  });
  const w = 390 * 2;
  const h = 780 * 2;
  const gap = 40;
  // composite first, then shrink: sharp applies a resize before it composites, so doing both in one step would fail
  const sheet = await sharp({ create: { width: w * 3 + gap * 2, height: h, channels: 3, background: '#f3f5ea' } })
    .composite([home, product, cart].map((input, i) => ({ input, left: i * (w + gap), top: 0 })))
    .png()
    .toBuffer();
  await sharp(sheet).resize({ width: 1500 }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, 'mobile.jpg'));

  await save(
    'admin',
    await shoot('admin', '/admin', {
      prepare: async (page) => {
        await page.type('#pw', ADMIN_PASSWORD);
        await Promise.all([page.waitForSelector('.admin-shell'), page.keyboard.press('Enter')]);
        await new Promise((r) => setTimeout(r, 800));
      },
    }),
  );
  console.log(`wrote ${(await fs.readdir(OUT)).length} screenshots to ${path.relative(ROOT, OUT)}`);
} finally {
  await browser.close();
  await shop.stop();
}
