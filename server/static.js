// Page and asset server: routes storefront URLs to their page template, serves static files and the generated
// sitemap/robots files, and takes care of caching and compression headers.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, collections, posts, products } from './db.js';
import { MIME, COMPRESSIBLE, BASE_HEADERS, esc, publicOrigin } from './util.js';
import { Payload, sendPayload } from './encode.js';
import { manifest, cacheControlFor } from './assets.js';
import { DOCUMENT_HEADERS } from './headers.js';
import { renderPage } from './pages.js';

const PUBLIC = path.join(ROOT, 'public'); // static assets only (CSS parts, JS, fonts, images)
const CSS_PARTS = path.join(PUBLIC, 'assets', 'css', 'parts');

/** URL patterns and the template that renders each. Every page is the same shell; the browser fills in the data. */
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

// ---------------------------------------------------------------- pages

/** Cache-Control for HTML: always revalidated by browsers; shared caches (a CDN) may keep it briefly. */
const HTML_CACHE = manifest
  ? 'public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=86400'
  : 'no-cache';

function sendHtml(req, res, name, pathname, status = 200) {
  const payload = renderPage(name, pathname, publicOrigin(req));
  if (!payload) return false;
  const isAdmin = name === 'admin.html';
  sendPayload(
    req,
    res,
    payload,
    {
      ...DOCUMENT_HEADERS,
      // the dashboard shell must never be cached or indexed
      'Cache-Control': isAdmin ? 'no-store' : status === 200 ? HTML_CACHE : 'no-cache',
      ...(isAdmin ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
    },
    status,
  );
  return true;
}

// ---------------------------------------------------------------- stylesheets and static files

const cssCache = new Map(); // 'theme' | 'admin' -> { stamp, payload }

/**
 * The readable stylesheets are kept as numbered parts in public/assets/css/parts. During development the server joins
 * them on request (admin.css is the part named 90-admin); the production build minifies them into fingerprinted files.
 */
function cssBundle(kind) {
  const files = fs
    .readdirSync(CSS_PARTS)
    .filter((f) => f.endsWith('.css') && (kind === 'admin' ? f.includes('admin') : !f.includes('admin')))
    .sort();
  const stamp = files.map((f) => fs.statSync(path.join(CSS_PARTS, f)).mtimeMs).join(',');
  const hit = cssCache.get(kind);
  if (hit && hit.stamp === stamp) return hit.payload;
  const text = files.map((f) => `/* ${f} */\n${fs.readFileSync(path.join(CSS_PARTS, f), 'utf8')}\n`).join('');
  const payload = new Payload(text, MIME['.css']);
  cssCache.set(kind, { stamp, payload });
  return payload;
}

const fileCache = new Map(); // absolute path -> { mtime, payload }

/**
 * Serve a file from public/. Text assets are kept in memory with their compressed variants; images and fonts, which
 * are already compressed and can be large, are streamed from disk.
 */
function sendFile(req, res, file, urlPath, versioned) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const headers = { ...BASE_HEADERS, 'Cache-Control': cacheControlFor(urlPath, versioned) };

  if (COMPRESSIBLE.has(ext) && st.size < 2_000_000) {
    let entry = fileCache.get(file);
    if (!entry || entry.mtime !== st.mtimeMs) {
      entry = { mtime: st.mtimeMs, payload: new Payload(fs.readFileSync(file), type, { quality: 11 }) };
      fileCache.set(file, entry);
    }
    sendPayload(req, res, entry.payload, headers);
    return true;
  }

  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const baseHeaders = { ...headers, ETag: etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, baseHeaders);
    res.end();
    return true;
  }
  res.writeHead(200, { ...baseHeaders, 'Content-Type': type, 'Content-Length': st.size });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
  return true;
}

// ---------------------------------------------------------------- sitemap and robots

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
  const entries = urls.map((u) => `<url><loc>${esc(base + u)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}

const sendText = (req, res, body, type) =>
  sendPayload(req, res, new Payload(body, type, { compress: false }), {
    ...BASE_HEADERS,
    'Cache-Control': 'public, max-age=3600',
  });

// ---------------------------------------------------------------- entry points

/** Handle a GET/HEAD request for a page, an asset or one of the generated files. */
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

  if (pathname === '/assets/css/theme.css' || pathname === '/assets/css/admin.css') {
    const kind = pathname.includes('admin') ? 'admin' : 'theme';
    return sendPayload(req, res, cssBundle(kind), { ...BASE_HEADERS, 'Cache-Control': 'no-cache' });
  }
  if (pathname === '/favicon.ico') {
    // modern browsers use the SVG <link rel="icon">; keep the old probe quiet
    res.writeHead(302, { Location: '/assets/img/shapes/favicon.svg', 'Cache-Control': 'public, max-age=86400' });
    return res.end();
  }
  if (pathname === '/robots.txt') {
    const origin = publicOrigin(req);
    return sendText(
      req,
      res,
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,
      MIME['.txt'],
    );
  }
  if (pathname === '/sitemap.xml') return sendText(req, res, sitemap(publicOrigin(req)), MIME['.xml']);

  for (const [re, file] of PAGE_ROUTES) {
    if (re.test(pathname)) return sendHtml(req, res, file, pathname) || notFound(req, res);
  }

  // static assets
  const rel = path.posix.normalize(pathname).replace(/^\/+/, '');
  if (rel.split('/').some((seg) => seg.startsWith('.')) || rel.endsWith('.html')) return notFound(req, res);
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return notFound(req, res);
  if (!sendFile(req, res, file, `/${rel}`, url.searchParams.has('v'))) return notFound(req, res);
}

export function notFound(req, res) {
  if (!sendHtml(req, res, '404.html', '/404', 404)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}
