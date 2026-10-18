// Tests for how pages, assets and the catalogue are delivered: validators, compression and the inline-script policy.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { startServer, rawRequest } from './support/server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

describe('catalogue endpoint', () => {
  it('can be cached by browsers and CDNs, and says how to revalidate', async () => {
    const res = await rawRequest(server.base, '/api/catalogue');
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'], /public/);
    assert.match(res.headers['cache-control'], /s-maxage=\d+/);
    assert.match(res.headers.etag, /^W\/"/);
    assert.equal(res.headers.vary, 'Accept-Encoding');
  });

  it('answers a conditional request with 304 and no body', async () => {
    const first = await rawRequest(server.base, '/api/catalogue');
    const again = await rawRequest(server.base, '/api/catalogue', { headers: { 'if-none-match': first.headers.etag } });
    assert.equal(again.status, 304);
    assert.equal(again.bytes.length, 0);
  });

  it('compresses with Brotli or gzip when the client accepts it, and identically decodes', async () => {
    const plain = await rawRequest(server.base, '/api/catalogue', { headers: { 'accept-encoding': 'identity' } });
    assert.equal(plain.headers['content-encoding'], undefined);

    const br = await rawRequest(server.base, '/api/catalogue', { headers: { 'accept-encoding': 'gzip, br' } });
    assert.equal(br.headers['content-encoding'], 'br');
    assert.equal(zlib.brotliDecompressSync(br.bytes).toString(), plain.body);

    const gz = await rawRequest(server.base, '/api/catalogue', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.equal(zlib.gunzipSync(gz.bytes).toString(), plain.body);
    assert.ok(br.bytes.length < plain.bytes.length / 4, 'JSON should compress well');
  });

  it('honours q=0 in Accept-Encoding', async () => {
    const res = await rawRequest(server.base, '/api/catalogue', { headers: { 'accept-encoding': 'br;q=0, gzip' } });
    assert.equal(res.headers['content-encoding'], 'gzip');
  });

  it('is the same for every visitor and carries no personal data', async () => {
    const a = await rawRequest(server.base, '/api/catalogue', { headers: { cookie: 'di_session=whatever' } });
    const b = await rawRequest(server.base, '/api/catalogue');
    assert.equal(a.body, b.body);
    assert.equal(a.headers['set-cookie'], undefined);
  });

  it('reflects stock changes made through the admin dashboard', async () => {
    const before = JSON.parse((await rawRequest(server.base, '/api/catalogue')).body);
    const handle = before.products[0].handle;
    const login = await fetch(`${server.base}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test-admin-passphrase-2026' }),
    });
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    await fetch(`${server.base}/api/admin/products/${handle}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ stock: 7 }),
    });
    const after = JSON.parse((await rawRequest(server.base, '/api/catalogue')).body);
    assert.equal(after.products[0].stock, 7);
  });
});

describe('pages', () => {
  it('carry a validator and are revalidated rather than cached blindly', async () => {
    const res = await rawRequest(server.base, '/');
    assert.match(res.headers.etag, /^W\/"/);
    assert.match(res.headers['cache-control'], /no-cache|must-revalidate/);
    const again = await rawRequest(server.base, '/', { headers: { 'if-none-match': res.headers.etag } });
    assert.equal(again.status, 304);
  });

  it('inline exactly one script - the pre-paint snippet - and the CSP allows it by hash', async () => {
    const res = await rawRequest(server.base, '/collections');
    const inline = [...res.body.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(inline.length, 1);
    const hash = crypto.createHash('sha256').update(inline[0][1]).digest('base64');
    assert.ok(res.headers['content-security-policy'].includes(`'sha256-${hash}'`));
  });

  it('start the catalogue and session requests while the page is still loading', async () => {
    const res = await rawRequest(server.base, '/products/coca-cola-original-250ml-can');
    assert.match(res.body, /<link rel="preload" href="\/api\/catalogue" as="fetch" crossorigin="anonymous">/);
    assert.match(res.body, /<link rel="preload" href="\/api\/me" as="fetch" crossorigin="anonymous">/);
    const admin = await rawRequest(server.base, '/admin');
    assert.doesNotMatch(admin.body, /rel="preload" href="\/api\//, 'the dashboard does not use the catalogue');
  });

  it('describe themselves for search engines and link previews with absolute URLs', async () => {
    const res = await rawRequest(server.base, '/products/coca-cola-original-250ml-can');
    assert.match(
      res.body,
      new RegExp(`<link rel="canonical" href="${server.base}/products/coca-cola-original-250ml-can">`),
    );
    assert.match(res.body, new RegExp(`<meta property="og:image" content="${server.base}/assets/img/products/`));
    assert.match(res.body, /<meta name="twitter:card" content="summary_large_image">/);
  });

  it('keep private pages out of search results and give unknown products no canonical link', async () => {
    assert.match((await rawRequest(server.base, '/cart')).body, /<meta name="robots" content="noindex">/);
    assert.match(
      (await rawRequest(server.base, '/orders/DI-123456-ABCD')).body,
      /<meta name="robots" content="noindex">/,
    );
    const unknown = await rawRequest(server.base, '/products/no-such-drink');
    assert.doesNotMatch(unknown.body, /rel="canonical"/);
  });
});

describe('static assets', () => {
  it('compress text files and validate them with ETags', async () => {
    const css = await rawRequest(server.base, '/assets/css/theme.css', { headers: { 'accept-encoding': 'br' } });
    assert.equal(css.status, 200);
    assert.equal(css.headers['content-encoding'], 'br');
    assert.match(css.headers['content-type'], /text\/css/);
    const again = await rawRequest(server.base, '/assets/css/theme.css', {
      headers: { 'if-none-match': css.headers.etag },
    });
    assert.equal(again.status, 304);
  });

  it('serve the storefront and dashboard styles separately', async () => {
    const theme = await rawRequest(server.base, '/assets/css/theme.css');
    const admin = await rawRequest(server.base, '/assets/css/admin.css');
    assert.doesNotMatch(theme.body, /\.admin-shell/);
    assert.match(admin.body, /\.admin-shell/);
  });

  it('stream images without trying to compress them', async () => {
    const res = await rawRequest(server.base, '/assets/img/scenes/blog-1.webp', {
      headers: { 'accept-encoding': 'br, gzip' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-encoding'], undefined);
    assert.equal(res.headers['content-type'], 'image/webp');
    assert.equal(Number(res.headers['content-length']), res.bytes.length);
  });

  it('are not cached without a build, so edits show up straight away', async () => {
    const res = await rawRequest(server.base, '/assets/js/app.js');
    assert.equal(res.headers['cache-control'], 'no-cache');
  });
});
