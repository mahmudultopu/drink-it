// Page and asset server: expands the HTML templates, serves static files and the generated sitemap/robots files,
// and takes care of caching, compression and the security headers that go with them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, site, products, collections, posts, pages } from './db.js';
import { MIME, COMPRESSIBLE, SECURE, esc, publicOrigin } from './util.js';
import { Payload, sendPayload } from './encode.js';
import { manifest, rewriteHtml, cacheControlFor } from './assets.js';

const PUBLIC = path.join(ROOT, 'public'); // static assets only (CSS parts, JS, fonts, images)
const VIEWS = path.join(ROOT, 'views'); // page templates, expanded by the server before they are sent
const PARTIALS = path.join(ROOT, 'partials'); // fragments shared by the templates (head, header, footer, scripts)
const CSS_PARTS = path.join(PUBLIC, 'assets', 'css', 'parts');
const BOOT_FILE = path.join(PUBLIC, 'assets', 'js', 'boot.js');

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

// ---------------------------------------------------------------- security headers

/**
 * The small script that runs before first paint (see public/assets/js/boot.js) is inlined into every page so it costs
 * no request. The CSP below allows exactly that script by its hash; no other inline script can run.
 */
const bootSource = manifest?.inline?.boot ?? fs.readFileSync(BOOT_FILE, 'utf8');
const bootHash = crypto.createHash('sha256').update(bootSource).digest('base64');

// Content-Security-Policy: everything is served from our own origin, so nothing else is allowed to run or load.
//  - Inline `style="..."` attributes are allowed (the templates position decorative elements with them) but <style>
//    blocks are not.
//  - frame-ancestors 'none' stops the site being embedded in other pages (clickjacking).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  `script-src 'self' 'sha256-${bootHash}'`,
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
const DOCUMENT_HEADERS = {
  ...BASE_HEADERS,
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};

// ---------------------------------------------------------------- template expansion

// The browser starts these requests while it is still parsing the page, so the data is usually there by the time the
// scripts need it. They are left out of the admin dashboard, which does not use the catalogue.
const STOREFRONT_PRELOADS = [
  '<link rel="preload" href="/api/catalogue" as="fetch" crossorigin="anonymous">',
  '<link rel="preload" href="/api/me" as="fetch" crossorigin="anonymous">',
].join('\n');

const partialCache = new Map(); // name -> { mtime, text }

/** Text of partials/<name>.html, re-read when the file changes. */
function readPartial(name) {
  const file = path.join(PARTIALS, `${name}.html`);
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

/** Modification times of every partial, so a cached page is rebuilt when any of them is edited. */
const partialsStamp = () =>
  fs
    .readdirSync(PARTIALS)
    .map((f) => fs.statSync(path.join(PARTIALS, f)).mtimeMs)
    .join(',');

const lookup = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

/**
 * Expand a template:
 *   <!--@name-->   include partials/name.html (recursively); `meta`, `preload` and `boot` are filled by the server
 *   {{ a.b.c }}    value from the site configuration, HTML-escaped
 */
function fill(html, extra = {}) {
  const ctx = { site: site.get(), year: new Date().getFullYear() };
  const special = {
    meta: extra.meta || '',
    preload: extra.preload || '',
    boot: `<script>${bootSource}</script>`,
  };
  return html
    .replace(/<!--@(\w+)-->/g, (_, name) => (name in special ? special[name] : fill(readPartial(name), extra)))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => esc(lookup(ctx, k) ?? ''));
}

/**
 * Title, description, canonical link and social-card tags for one page.
 * `path` (site-relative) is omitted for pages that must not get a canonical URL, such as the 404 page.
 */
function metaTags({ title, description, image, path: pagePath, type = 'website', noindex = false }, origin) {
  const s = site.get();
  const fullTitle = title ? `${title} – ${s.name}` : `${s.name} — ${s.tagline}`;
  const desc = description || s.description;
  const url = pagePath === undefined ? '' : `${origin}${pagePath === '/' ? '' : pagePath}`;
  const img = image ? `${origin}${image}` : '';
  return [
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    noindex ? '<meta name="robots" content="noindex">' : '',
    url ? `<link rel="canonical" href="${esc(url)}">` : '',
    `<meta property="og:site_name" content="${esc(s.name)}">`,
    `<meta property="og:title" content="${esc(fullTitle)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:type" content="${type}">`,
    url ? `<meta property="og:url" content="${esc(url)}">` : '',
    img ? `<meta property="og:image" content="${esc(img)}">` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
  ]
    .filter(Boolean)
    .join('\n');
}

// Fixed pages that get a canonical URL, and the ones that belong to a visitor rather than the public catalogue and so
// are kept out of search results.
const PUBLIC_PAGES = new Set([
  '/',
  '/home-2',
  '/collections',
  '/blogs/news',
  '/pages/about-us',
  '/pages/contact',
  '/pages/faq',
  '/pages/our-locations',
  '/track',
]);
const PRIVATE_PAGES = new Set(['/cart', '/checkout', '/search', '/wishlist', '/compare', '/account']);

/**
 * Meta tags for the page at `pathname` (already percent-decoded by the caller). Unknown handles fall back to the
 * generic tags without a canonical link, so junk URLs all share one cached page.
 */
function metaFor(pathname, origin) {
  const canonical = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  let m;
  if ((m = pathname.match(/^\/products\/([^/]+)/))) {
    const p = products.get().find((x) => x.handle === m[1]);
    if (p) {
      return metaTags(
        {
          title: p.title,
          description: `${p.short} Order ${p.title} online in Bangladesh — singles, 6-packs and cartons delivered to your door.`,
          image: p.images.single,
          path: canonical,
          type: 'product',
        },
        origin,
      );
    }
  } else if ((m = pathname.match(/^\/collections\/([^/]+)/))) {
    const c = collections.get().find((x) => x.handle === m[1]);
    if (c) return metaTags({ title: c.title, description: c.blurb, path: canonical }, origin);
  } else if ((m = pathname.match(/^\/blogs\/news\/([^/]+)/))) {
    const p = posts.get().find((x) => x.handle === m[1]);
    if (p) {
      return metaTags(
        { title: p.title, description: p.excerpt, image: p.image, path: canonical, type: 'article' },
        origin,
      );
    }
  } else if ((m = pathname.match(/^\/pages\/([^/]+)/))) {
    const all = pages.get();
    const p = Object.hasOwn(all, m[1]) ? all[m[1]] : null;
    if (p) return metaTags({ title: p.title, description: p.intro, path: canonical }, origin);
  }
  if (PUBLIC_PAGES.has(canonical)) return metaTags({ path: canonical }, origin);
  const noindex = PRIVATE_PAGES.has(canonical) || canonical.startsWith('/account/') || pathname.startsWith('/orders/');
  return metaTags({ noindex }, origin);
}

// ---------------------------------------------------------------- pages

const MAX_CACHED_PAGES = 300; // a Host header is attacker-controlled, so the number of cached variants is bounded
const pageCache = new Map(); // key -> { stamp, payload }

/**
 * Render a page template to a cacheable Payload. The result is kept until the template, a partial or the data it
 * was built from changes.
 */
function renderPage(name, pathname, origin) {
  let st;
  try {
    st = fs.statSync(path.join(VIEWS, name));
  } catch {
    return null;
  }
  const isAdmin = name === 'admin.html';
  const meta = isAdmin ? '' : metaFor(pathname, origin);
  const stamp = [st.mtimeMs, partialsStamp(), site.stamp(), new Date().getFullYear()].join('|');
  const key = `${name}|${origin}|${meta}`;
  const hit = pageCache.get(key);
  if (hit && hit.stamp === stamp) return hit.payload;

  const html = rewriteHtml(
    fill(fs.readFileSync(path.join(VIEWS, name), 'utf8'), { meta, preload: isAdmin ? '' : STOREFRONT_PRELOADS }),
  );
  const payload = new Payload(html, MIME['.html'], { quality: 6 });
  if (pageCache.size >= MAX_CACHED_PAGES) pageCache.delete(pageCache.keys().next().value);
  pageCache.set(key, { stamp, payload });
  return payload;
}

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
