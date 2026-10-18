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

describe('server-rendered page content', () => {
  it('puts the banner heading and text into the HTML of content pages', async () => {
    const res = await rawRequest(server.base, '/pages/about-us');
    assert.match(res.body, /<h1>About Us<\/h1>/);
    assert.match(res.body, /<title>About Us – Drink it<\/title>/);
    assert.match(res.body, /<a class="btn btn--lime" href="\/collections">Shop by Categories<\/a>/);
    assert.match(res.body, /<img src="\/assets\/img\/scenes\/banner-cans-1068\.webp"[^>]*fetchpriority="high"/);
  });

  it('takes collection, article and policy banners from the catalogue data', async () => {
    const collection = await rawRequest(server.base, '/collections/cola-classics');
    assert.match(collection.body, /<h1>Cola Classics<\/h1>/);
    assert.match(collection.body, /<title>Cola Classics – Drink it<\/title>/);

    const all = await rawRequest(server.base, '/collections/all');
    assert.match(all.body, /<h1>All Cans<\/h1>/);

    const { posts } = JSON.parse((await rawRequest(server.base, '/api/catalogue')).body);
    const article = await rawRequest(server.base, `/blogs/news/${posts[0].handle}`);
    assert.ok(article.body.includes(`<h1>${posts[0].title.replace(/&/g, '&amp;')}</h1>`), posts[0].title);

    const policy = await rawRequest(server.base, '/pages/shipping-policy');
    assert.match(policy.body, /<h1>Shipping Policy<\/h1>/);
    assert.match(policy.body, /Last updated/);
  });

  it('formats configuration values used in page text', async () => {
    const res = await rawRequest(server.base, '/pages/our-locations');
    assert.match(res.body, /Delivery is free on orders above ৳1,500/);
  });

  it('leaves the banner empty for unknown handles instead of inventing content', async () => {
    for (const url of ['/collections/no-such-collection', '/blogs/news/no-such-article', '/products/no-such-drink']) {
      const res = await rawRequest(server.base, url);
      assert.equal(res.status, 200, url);
      assert.doesNotMatch(res.body, /rel="canonical"/, url);
    }
    const collection = await rawRequest(server.base, '/collections/no-such-collection');
    assert.match(collection.body, /<h1><\/h1>/);
  });

  it('starts fetching the main product photo before any script runs', async () => {
    const res = await rawRequest(server.base, '/products/coca-cola-original-250ml-can');
    assert.match(
      res.body,
      /<link rel="preload" as="image" href="\/assets\/img\/products\/coca-cola-original-250ml-can\.webp" fetchpriority="high">/,
    );
  });

  it('gives every storefront page a title of its own', async () => {
    const expected = {
      '/cart': 'Your Cart',
      '/checkout': 'Checkout',
      '/wishlist': 'Your Wishlist',
      '/search': 'Search',
      '/account/login': 'Log in or Register',
      '/pages/faq': 'FAQ’s',
    };
    for (const [url, title] of Object.entries(expected)) {
      const res = await rawRequest(server.base, url);
      assert.ok(res.body.includes(`<title>${title} – Drink it</title>`), `${url} -> ${title}`);
    }
  });

  it('does not leak the page header comment into the output', async () => {
    const res = await rawRequest(server.base, '/pages/contact');
    assert.doesNotMatch(res.body, /<!--page/);
    assert.ok(res.body.trimStart().startsWith('<!doctype html>'));
  });

  it('rejects tags and quotes in a page title by escaping them', async () => {
    const res = await rawRequest(server.base, '/pages/contact');
    assert.doesNotMatch(res.body, /<h1>[^<]*[<>"][^<]*<\/h1>/);
  });
});
