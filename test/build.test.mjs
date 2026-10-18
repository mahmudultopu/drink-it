// Tests for the production asset build (scripts/build-assets.mjs) and for serving it.
// The build writes to public/assets/dist, which is git-ignored; an existing build is set aside and restored afterwards.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, startServer, rawRequest } from './support/server.mjs';

const DIST = path.join(ROOT, 'public', 'assets', 'dist');
const PARKED = `${DIST}.parked`;

let server;
let manifest;
let hadBuild = false;

before(async () => {
  if (existsSync(DIST)) {
    hadBuild = true;
    await rm(PARKED, { recursive: true, force: true });
    await rename(DIST, PARKED);
  }
  const build = spawnSync(process.execPath, ['scripts/build-assets.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  manifest = JSON.parse(await readFile(path.join(DIST, 'manifest.json'), 'utf8'));
  server = await startServer({ DRINKIT_ASSETS: 'built' });
});

after(async () => {
  await server?.stop();
  await rm(DIST, { recursive: true, force: true });
  if (hadBuild) await rename(PARKED, DIST);
});

// identity by default, so page text can be inspected; tests that care about compression ask for it
const get = (url, headers = {}) =>
  rawRequest(server.base, url, { headers: { 'accept-encoding': 'identity', ...headers } });

describe('build output', () => {
  it('produces fingerprinted bundles for the storefront and the dashboard', () => {
    assert.deepEqual(Object.keys(manifest.entries).sort(), [
      '/assets/css/admin.css',
      '/assets/css/theme.css',
      '/assets/js/admin.js',
      '/assets/js/app.js',
    ]);
    for (const entry of Object.values(manifest.entries))
      assert.match(entry.file, /^\/assets\/dist\/(js|css)\/\w+-[A-Z0-9]+\.(js|css)$/);
  });

  it('records a content hash for every image and font', () => {
    assert.ok(Object.keys(manifest.assets).length > 100);
    assert.match(manifest.assets['/assets/fonts/dm-sans-latin.woff2'], /^[0-9a-f]{10}$/);
    assert.ok(manifest.assets['/assets/img/icons.svg']);
  });

  it('knows which chunks every page module needs', () => {
    for (const page of ['home', 'product', 'checkout', 'collection', 'cart']) {
      assert.ok(manifest.pages[page]?.length >= 1, page);
    }
  });

  it('inlines a minified copy of the pre-paint script', () => {
    assert.ok(manifest.inline.boot.length < 600);
    assert.doesNotMatch(manifest.inline.boot, /\/\*|\n/);
  });
});

describe('pages from a build', () => {
  it('point at the fingerprinted bundles and preload what the page needs', async () => {
    const res = await get('/products/coca-cola-original-250ml-can');
    assert.match(res.body, /href="\/assets\/dist\/css\/theme-[A-Z0-9]+\.css"/);
    assert.match(res.body, /src="\/assets\/dist\/js\/app-[A-Z0-9]+\.js"/);
    assert.doesNotMatch(res.body, /\/assets\/js\/app\.js|\/assets\/css\/theme\.css/);
    const productChunk = manifest.pages.product[0];
    assert.ok(res.body.includes(`<link rel="modulepreload" href="${productChunk}">`));
  });

  it('use the dashboard bundle on the admin page only', async () => {
    const admin = await get('/admin');
    assert.match(admin.body, /\/assets\/dist\/js\/admin-[A-Z0-9]+\.js/);
    assert.match(admin.body, /\/assets\/dist\/css\/admin-[A-Z0-9]+\.css/);
    const home = await get('/');
    assert.doesNotMatch(home.body, /admin-[A-Z0-9]+\.(js|css)/);
  });

  it('version the images and fonts they reference', async () => {
    const res = await get('/');
    const refs = [...res.body.matchAll(/\/assets\/(?:img|fonts)\/[\w./-]+\.(?:webp|svg|woff2)(\?v=[0-9a-f]{10})?/g)];
    assert.ok(refs.length > 10);
    assert.deepEqual(
      refs.filter((m) => !m[1]).map((m) => m[0]),
      [],
      'every asset reference carries a hash',
    );
  });

  it('allow shared caches to keep them for a few minutes', async () => {
    const res = await get('/');
    assert.match(res.headers['cache-control'], /s-maxage=300/);
    assert.match(res.headers['cache-control'], /must-revalidate/);
  });

  it('allow the inlined pre-paint script by hash', async () => {
    const res = await get('/');
    const inline = /<script>([\s\S]*?)<\/script>/.exec(res.body)[1];
    assert.equal(inline, manifest.inline.boot);
    const hash = crypto.createHash('sha256').update(inline).digest('base64');
    assert.ok(res.headers['content-security-policy'].includes(`'sha256-${hash}'`));
  });

  it('reference only files that exist', async () => {
    for (const page of [
      '/',
      '/collections/cola-classics',
      '/products/coca-cola-original-250ml-can',
      '/admin',
      '/cart',
    ]) {
      const res = await get(page);
      const urls = new Set([...res.body.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1]));
      assert.ok(urls.size >= 5, page);
      for (const url of urls) {
        const asset = await get(url);
        assert.equal(asset.status, 200, `${page} -> ${url}`);
      }
    }
  });
});

describe('assets from a build', () => {
  const bundle = () => manifest.entries['/assets/js/app.js'].file;

  it('are cached for a year, immutably, when their URL carries a fingerprint', async () => {
    const js = await get(bundle(), { 'accept-encoding': 'br' });
    assert.equal(js.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(js.headers['content-encoding'], 'br');
    assert.match(js.headers['content-type'], /text\/javascript/);
    const font = '/assets/fonts/dm-sans-latin.woff2';
    const versioned = await get(`${font}?v=${manifest.assets[font]}`);
    assert.equal(versioned.headers['cache-control'], 'public, max-age=31536000, immutable');
  });

  it('are revalidated daily when requested without a fingerprint', async () => {
    const res = await get('/assets/img/scenes/blog-1.webp');
    assert.match(res.headers['cache-control'], /max-age=86400/);
    assert.doesNotMatch(res.headers['cache-control'], /immutable/);
  });

  it('are minified and much smaller than the sources', async () => {
    const css = await get(manifest.entries['/assets/css/theme.css'].file, { 'accept-encoding': 'br' });
    const source = await readFile(path.join(ROOT, 'public/assets/css/parts/20-components.css'), 'utf8');
    assert.ok(zlib.brotliDecompressSync(css.bytes).length < 110_000);
    assert.ok(css.bytes.length < 25_000, `${css.bytes.length} bytes over the wire`);
    assert.ok(source.length > 20_000);
    assert.doesNotMatch(zlib.brotliDecompressSync(css.bytes).toString(), /\n\s{2,}/);
  });

  it('give the catalogue fingerprinted image URLs, but leave free text alone', async () => {
    const catalogue = JSON.parse((await get('/api/catalogue', { 'accept-encoding': 'identity' })).body);
    for (const url of Object.values(catalogue.products[0].images)) assert.match(url, /\?v=[0-9a-f]{10}$/, url);
    const review = await fetch(`${server.base}/api/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        product: catalogue.products[0].handle,
        name: 'Tester',
        rating: 5,
        body: 'see /assets/img/scenes/blog-1.webp',
      }),
    });
    assert.equal(review.status, 201);
  });
});
