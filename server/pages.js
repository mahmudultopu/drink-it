// HTML pages: expands the view templates, fills in titles and social-card tags, and renders the parts of a page that
// belong in the first HTML the browser receives (the banner with its heading) instead of waiting for scripts.
//
// A view may start with a header comment that describes the page:
//
//   <!--page {"title": "About Us", "text": "Short intro shown in the banner and used as the description."} -->
//
// title / text / description / cta feed the <title>, the meta tags and the shared banner partial. Pages whose
// content comes from the catalogue (products, collections, articles, policies) override them with the real data.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, site, products, collections, posts, pages } from './db.js';
import { MIME, esc } from './util.js';
import { Payload } from './encode.js';
import { rewriteHtml } from './assets.js';
import { bootScript } from './headers.js';

const VIEWS = path.join(ROOT, 'views'); // page templates, expanded by the server before they are sent
const PARTIALS = path.join(ROOT, 'partials'); // fragments shared by the templates (head, header, footer, banner...)

// ---------------------------------------------------------------- template syntax

// The browser starts these requests while it is still parsing the page, so the data is usually there by the time the
// scripts need it. They are left out of the admin dashboard, which does not use the catalogue.
const STOREFRONT_PRELOADS = [
  '<link rel="preload" href="/api/catalogue" as="fetch" crossorigin="anonymous">',
  '<link rel="preload" href="/api/me" as="fetch" crossorigin="anonymous">',
];

const taka = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
/** Filters for `{{ value | name }}` expressions. */
const FILTERS = { money: (v) => `৳${taka.format(Math.round(Number(v) || 0))}` };

const lookup = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

/** Value of a `{{ path | filter }}` expression, unescaped. */
function evaluate(expression, ctx) {
  const [dotted, filter] = expression.split('|').map((s) => s.trim());
  const value = lookup(ctx, dotted) ?? '';
  return Object.hasOwn(FILTERS, filter) ? FILTERS[filter](value) : String(value);
}

const TOKEN = /\{\{\s*([\w.]+(?:\s*\|\s*\w+)?)\s*\}\}/g;

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

/**
 * Expand a template:
 *   <!--@name-->        include partials/name.html (recursively)
 *   {{ a.b.c }}         value from the site configuration or the page header, HTML-escaped
 *   {{ a.b | money }}   the same, formatted (৳1,500)
 * `meta`, `preload`, `boot`, `bannerCta` and `productImage` are not files: the server supplies them.
 */
function fill(template, { meta = '', preload = '', page = {} } = {}) {
  const ctx = { site: site.get(), year: new Date().getFullYear(), page };
  const special = {
    meta,
    preload,
    boot: `<script>${bootScript}</script>`,
    bannerCta: page.cta ? `<a class="btn btn--lime" href="${esc(page.cta.href)}">${esc(page.cta.label)}</a>` : '',
    // The product page's main photo, so it is part of the first HTML. The page script later renders the same image.
    productImage: page.image
      ? `<img src="${esc(page.image)}" alt="${esc(page.title)}" width="640" height="620" fetchpriority="high">`
      : '',
  };
  const expand = (text) =>
    text
      .replace(/<!--@(\w+)-->/g, (_, name) =>
        Object.hasOwn(special, name) ? special[name] : expand(readPartial(name)),
      )
      .replace(TOKEN, (_, expression) => esc(evaluate(expression, ctx)));
  return expand(template);
}

// ---------------------------------------------------------------- views

const viewCache = new Map(); // file name -> { mtime, template, front }

/** A view split into its template and the optional `<!--page {...} -->` header. */
function readView(name) {
  const file = path.join(VIEWS, name);
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const hit = viewCache.get(name);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const source = fs.readFileSync(file, 'utf8');
  const m = /^<!--page\s+(\{[\s\S]*?\})\s*-->\s*/.exec(source);
  let front = {};
  if (m) {
    try {
      front = JSON.parse(m[1]);
    } catch (err) {
      throw new Error(`views/${name}: the <!--page --> header is not valid JSON (${err.message})`, { cause: err });
    }
  }
  const view = { mtime: st.mtimeMs, template: m ? source.slice(m[0].length) : source, front };
  viewCache.set(name, view);
  return view;
}

// ---------------------------------------------------------------- what each page is about

// Fixed pages that get a canonical URL, and the ones that belong to a visitor rather than the public catalogue and so
// are kept out of search results.
const PUBLIC_PAGES = new Set([
  '/',
  '/home-2',
  '/collections',
  '/collections/all',
  '/blogs/news',
  '/pages/about-us',
  '/pages/contact',
  '/pages/faq',
  '/pages/our-locations',
  '/track',
]);
const PRIVATE_PAGES = new Set(['/cart', '/checkout', '/search', '/wishlist', '/compare', '/account']);

/**
 * Work out the title, text, description, image and canonical path of a page. `front` holds the defaults from the
 * view's header. Unknown handles produce an empty description, so every junk URL shares one cached page.
 */
function describePage(name, pathname, front) {
  const canonical = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const segment = canonical.split('/').pop();
  const defaults = {
    title: front.title,
    text: front.text,
    description: front.description || front.text,
    cta: front.cta,
  };
  switch (name) {
    case 'product.html': {
      const p = products.get().find((x) => x.handle === segment);
      if (!p) return {};
      return {
        title: p.title,
        description: `${p.short} Order ${p.title} online in Bangladesh — singles, 6-packs and cartons delivered to your door.`,
        image: p.images.single,
        // the main photo is the largest thing on the page, so let the browser start fetching it straight away
        preloadImage: p.images.single,
        type: 'product',
        canonical,
      };
    }
    case 'collection.html': {
      if (segment === 'all') return { ...defaults, canonical };
      const c = collections.get().find((x) => x.handle === segment);
      return c ? { title: c.title, text: c.blurb, description: c.blurb, canonical } : {};
    }
    case 'article.html': {
      const p = posts.get().find((x) => x.handle === segment);
      return p
        ? { title: p.title, text: p.excerpt, description: p.excerpt, image: p.image, type: 'article', canonical }
        : {};
    }
    case 'policy.html': {
      const all = pages.get();
      // hasOwn: "constructor" is not a policy page, even though every object "has" one
      if (!Object.hasOwn(all, segment)) return {};
      return { title: all[segment].title, text: front.text, description: all[segment].intro, canonical };
    }
    default: {
      if (PUBLIC_PAGES.has(canonical)) return { ...defaults, canonical };
      const noindex =
        PRIVATE_PAGES.has(canonical) || canonical.startsWith('/account/') || pathname.startsWith('/orders/');
      return { title: front.title, description: front.description, noindex };
    }
  }
}

/** Title, description, canonical link and social-card tags. */
function metaTags(info, origin) {
  const s = site.get();
  const title = info.title ? `${info.title} – ${s.name}` : `${s.name} — ${s.tagline}`;
  const description = info.description || s.description;
  const url = info.canonical === undefined ? '' : `${origin}${info.canonical === '/' ? '' : info.canonical}`;
  const image = info.image ? `${origin}${info.image}` : '';
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    info.noindex ? '<meta name="robots" content="noindex">' : '',
    url ? `<link rel="canonical" href="${esc(url)}">` : '',
    `<meta property="og:site_name" content="${esc(s.name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:type" content="${info.type || 'website'}">`,
    url ? `<meta property="og:url" content="${esc(url)}">` : '',
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------- rendering

const MAX_CACHED_PAGES = 300; // a Host header is attacker-controlled, so the number of cached variants is bounded
const pageCache = new Map(); // key -> { stamp, payload }

/**
 * Render a page to a cacheable Payload, or return null when the view does not exist. The result is kept until the
 * template, a partial or the data it was built from changes.
 * @param {string} name view file name, e.g. "product.html"
 * @param {string} pathname percent-decoded request path
 * @param {string} origin scheme and host the visitor used (for absolute URLs in meta tags)
 */
export function renderPage(name, pathname, origin) {
  const view = readView(name);
  if (!view) return null;
  const isAdmin = name === 'admin.html';
  const info = isAdmin ? {} : describePage(name, pathname, view.front);

  const stamp = [view.mtime, partialsStamp(), site.stamp(), new Date().getFullYear()].join('|');
  const key = `${name}|${origin}|${JSON.stringify(info)}`;
  const hit = pageCache.get(key);
  if (hit && hit.stamp === stamp) return hit.payload;

  const preloads = isAdmin ? [] : [...STOREFRONT_PRELOADS];
  if (info.preloadImage)
    preloads.push(`<link rel="preload" as="image" href="${esc(info.preloadImage)}" fetchpriority="high">`);

  // Header values may contain {{ }} tokens of their own (the delivery page quotes the free-delivery threshold).
  const expandText = (text) =>
    typeof text === 'string' ? text.replace(TOKEN, (_, e) => evaluate(e, { site: site.get() })) : text;
  const page = { title: info.title, text: expandText(info.text), cta: info.cta, image: info.preloadImage };

  const html = rewriteHtml(
    fill(view.template, {
      meta: isAdmin ? '' : metaTags({ ...info, description: expandText(info.description) }, origin),
      preload: preloads.join('\n'),
      page,
    }),
  );
  const payload = new Payload(html, MIME['.html'], { quality: 6 });
  if (pageCache.size >= MAX_CACHED_PAGES) pageCache.delete(pageCache.keys().next().value);
  pageCache.set(key, { stamp, payload });
  return payload;
}
