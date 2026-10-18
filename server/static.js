// Static file server + page routing + HTML partial includes + CSS bundling + sitemap/robots.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { ROOT, site, products, collections, posts, pages } from './db.js';
import { MIME, COMPRESSIBLE, SECURE, esc, publicOrigin } from './util.js';

const PUBLIC = path.join(ROOT, 'public'); // static assets only (CSS parts, JS, fonts, images)
const VIEWS = path.join(ROOT, 'views'); // page templates, expanded by the server before they are sent
const PARTIALS = path.join(ROOT, 'partials');

const PAGE_ROUTES = [
  [/^\/$/, 'index.html'],
  [/^\/home-2\/?$/, 'home-2.html'],
  [/^\/collections\/?$/, 'collections.html'],
  [/^\/collections\/[^/]+\/?$/, 'collection.html'],
  [/^\/products\/[^/]+\/?$/, 'product.html'],
  [/^\/cart\/?$/, 'cart.html'],
  [/^\/checkout\/?$/, 'checkout.html'],
  [/^\/orders\/[^/]+\/?$/, 'order.html'],
  [/^\/track\/?$/, 'track.html'],
  [/^\/wishlist\/?$/, 'wishlist.html'],
  [/^\/compare\/?$/, 'compare.html'],
  [/^\/search\/?$/, 'search.html'],
  [/^\/account\/?$/, 'account.html'],
  [/^\/account\/(login|register)\/?$/, 'login.html'],
  [/^\/blogs\/news\/?$/, 'blog.html'],
  [/^\/blogs\/news\/[^/]+\/?$/, 'article.html'],
  [/^\/pages\/about-us\/?$/, 'about.html'],
  [/^\/pages\/contact\/?$/, 'contact.html'],
  [/^\/pages\/faq\/?$/, 'faq.html'],
  [/^\/pages\/our-locations\/?$/, 'locations.html'],
  [/^\/pages\/(shipping-policy|refund-policy|privacy-policy|terms-condition)\/?$/, 'policy.html'],
  [/^\/admin\/?$/, 'admin.html'],
];

// Content-Security-Policy: everything is served from our own origin, so nothing else is allowed to run or load.
//  - No inline scripts at all. Inline `style="..."` attributes are allowed (the templates position decorative
//    elements with them) but <style> blocks are not.
//  - frame-ancestors 'none' stops the site being embedded in other pages (clickjacking).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  ...(SECURE ? ['upgrade-insecure-requests'] : []),
].join('; ');

// Headers sent with every response (pages, assets and the API alike).
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  ...(SECURE ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
};

// Extra headers for HTML documents.
const SECURITY = {
  ...BASE_HEADERS,
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};

// ---------- tiny caches ----------
const fileCache = new Map(); // key -> { mtime, size, buf, gz, etag }
const partialCache = new Map();

function readPartial(name) {
  const file = path.join(PARTIALS, name + '.html');
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return `<!-- missing partial ${name} -->`;
  }
  const hit = partialCache.get(name);
  if (hit && hit.mtime === st.mtimeMs) return hit.text;
  const text = fs.readFileSync(file, 'utf8');
  partialCache.set(name, { mtime: st.mtimeMs, text });
  return text;
}

function lookup(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function fill(html, extra = {}) {
  const ctx = { site: site.get(), year: new Date().getFullYear(), ...extra };
  return html
    .replace(/<!--@(\w+)-->/g, (_, name) => (name === 'meta' ? extra.meta || '' : fill(readPartial(name), extra)))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => esc(lookup(ctx, k) ?? ''));
}

function metaTags({ title, description, image, url, type = 'website' }) {
  const s = site.get();
  const t = title ? `${title} – ${s.name}` : `${s.name} — ${s.tagline}`;
  const d = description || s.description;
  return `<title>${esc(t)}</title>
<meta name="description" content="${esc(d)}">
<meta property="og:site_name" content="${esc(s.name)}">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:type" content="${type}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
${url ? `<link rel="canonical" href="${esc(url)}">` : ''}`;
}

/** Title, description and social-card tags for the page at `pathname` (already percent-decoded by the caller). */
function metaFor(pathname) {
  let m;
  if ((m = pathname.match(/^\/products\/([^/]+)/))) {
    const p = products.get().find((x) => x.handle === m[1]);
    if (p)
      return metaTags({
        title: p.title,
        description: `${p.short} Order ${p.title} online in Bangladesh — singles, 6-packs and cartons delivered to your door.`,
        image: p.images.single,
        type: 'product',
      });
  } else if ((m = pathname.match(/^\/collections\/([^/]+)/))) {
    const c = collections.get().find((x) => x.handle === m[1]);
    if (c) return metaTags({ title: c.title, description: c.blurb });
  } else if ((m = pathname.match(/^\/blogs\/news\/([^/]+)/))) {
    const p = posts.get().find((x) => x.handle === m[1]);
    if (p) return metaTags({ title: p.title, description: p.excerpt, image: p.image, type: 'article' });
  } else if ((m = pathname.match(/^\/pages\/([^/]+)/))) {
    const all = pages.get();
    const p = Object.hasOwn(all, m[1]) ? all[m[1]] : null;
    if (p) return metaTags({ title: p.title, description: p.intro });
  }
  return metaTags({});
}

// ---------- CSS bundle: public/assets/css/parts/*.css concatenated ----------
function cssBundle() {
  const dir = path.join(PUBLIC, 'assets', 'css', 'parts');
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.css'))
        .sort()
    : [];
  let mtime = 0,
    text = '';
  for (const f of files) {
    const st = fs.statSync(path.join(dir, f));
    mtime = Math.max(mtime, st.mtimeMs);
  }
  const hit = fileCache.get('css-bundle');
  if (hit && hit.mtime === mtime) return hit;
  for (const f of files) text += `/* ${f} */\n` + fs.readFileSync(path.join(dir, f), 'utf8') + '\n';
  const buf = Buffer.from(text);
  const entry = {
    mtime,
    buf,
    gz: zlib.gzipSync(buf),
    etag: '"' + crypto.createHash('md5').update(buf).digest('hex') + '"',
  };
  fileCache.set('css-bundle', entry);
  return entry;
}

function send(req, res, status, buf, gz, type, extra = {}) {
  const headers = { 'Content-Type': type, Vary: 'Accept-Encoding', ...BASE_HEADERS, ...extra };
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  let body = buf;
  if (gz && acceptsGzip) {
    body = gz;
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendFile(req, res, file, status = 200) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  let entry = fileCache.get(file);
  if (!entry || entry.mtime !== st.mtimeMs) {
    const buf = fs.readFileSync(file);
    entry = {
      mtime: st.mtimeMs,
      buf,
      gz: COMPRESSIBLE.has(ext) && buf.length > 800 ? zlib.gzipSync(buf) : null,
      etag: `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`,
    };
    fileCache.set(file, entry);
  }
  const immutable =
    /\.(woff2?|svg|png|jpe?g|webp|ico)$/.test(ext) && /\/assets\/(fonts|img)\//.test(file.replace(/\\/g, '/'));
  const cache = immutable ? 'public, max-age=604800' : 'no-cache';
  if (req.headers['if-none-match'] === entry.etag) {
    res.writeHead(304, { ETag: entry.etag, 'Cache-Control': cache });
    res.end();
    return true;
  }
  send(req, res, status, entry.buf, entry.gz, type, { ETag: entry.etag, 'Cache-Control': cache });
  return true;
}

function sendHtml(req, res, name, pathname, status = 200) {
  const file = path.join(VIEWS, name);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  const html = fill(raw, { meta: metaFor(pathname) });
  const buf = Buffer.from(html);
  const isAdmin = name === 'admin.html';
  send(req, res, status, buf, buf.length > 800 ? zlib.gzipSync(buf) : null, MIME['.html'], {
    // the dashboard shell must never be cached or indexed
    'Cache-Control': isAdmin ? 'no-store' : 'no-cache',
    ...(isAdmin ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
    ...SECURITY,
  });
  return true;
}

function sitemap(base) {
  const urls = [
    '/',
    '/collections',
    '/blogs/news',
    '/pages/about-us',
    '/pages/contact',
    '/pages/faq',
    '/pages/our-locations',
    '/track',
  ]
    .concat(collections.get().map((c) => `/collections/${c.handle}`))
    .concat(products.get().map((p) => `/products/${p.handle}`))
    .concat(posts.get().map((p) => `/blogs/news/${p.handle}`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(base + u)}</loc></url>`).join('\n')}\n</urlset>`;
}

export function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = '';
  }
  // Reject anything that could climb out of public/: parent segments, NUL bytes, backslashes and drive letters.
  if (!pathname || pathname.includes('\0') || pathname.includes('..') || /[\\:]/.test(pathname)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }

  if (pathname === '/assets/css/theme.css') {
    const e = cssBundle();
    if (req.headers['if-none-match'] === e.etag) {
      res.writeHead(304, { ETag: e.etag });
      return res.end();
    }
    return send(req, res, 200, e.buf, e.gz, MIME['.css'], { ETag: e.etag, 'Cache-Control': 'no-cache' });
  }
  if (pathname === '/favicon.ico') {
    // modern browsers use the SVG <link rel="icon">; keep the old probe quiet
    res.writeHead(302, { Location: '/assets/img/shapes/favicon.svg', 'Cache-Control': 'public, max-age=86400' });
    return res.end();
  }
  if (pathname === '/robots.txt') {
    const body = Buffer.from(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${publicOrigin(req)}/sitemap.xml\n`,
    );
    return send(req, res, 200, body, null, MIME['.txt']);
  }
  if (pathname === '/sitemap.xml') {
    const body = Buffer.from(sitemap(publicOrigin(req)));
    return send(req, res, 200, body, null, MIME['.xml']);
  }

  for (const [re, file] of PAGE_ROUTES) {
    if (re.test(pathname)) return sendHtml(req, res, file, pathname) || notFound(req, res);
  }

  // static assets
  const rel = path.posix.normalize(pathname).replace(/^\/+/, '');
  if (rel.split('/').some((seg) => seg.startsWith('.')) || rel.endsWith('.html')) return notFound(req, res);
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return notFound(req, res);
  if (!sendFile(req, res, file)) return notFound(req, res);
}

export function notFound(req, res) {
  if (!sendHtml(req, res, '404.html', '/404', 404)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}
