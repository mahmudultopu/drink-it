// Glue between the production asset build and the server.
//
// `npm run build` (scripts/build-assets.mjs) bundles and minifies the front end into public/assets/dist/ and writes a
// manifest next to it. When that manifest exists the server
//   1. points pages at the fingerprinted bundles instead of the readable sources,
//   2. appends a content hash (?v=...) to image and font URLs, so those files can be cached for a year yet are
//      refetched the moment they change,
//   3. lets the static handler send long-lived Cache-Control headers for both.
// Without a manifest (a fresh clone running `npm start`) everything is served straight from the sources.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST_URL = '/assets/dist';
export const MANIFEST_FILE = path.join(ROOT, 'public', 'assets', 'dist', 'manifest.json');

/**
 * DRINKIT_ASSETS=source ignores any build output (used by the tests that exercise the readable sources);
 * DRINKIT_ASSETS=built insists on it. By default a build is used when one exists.
 */
function loadManifest() {
  if (process.env.DRINKIT_ASSETS === 'source') return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch (err) {
    if (process.env.DRINKIT_ASSETS === 'built')
      throw new Error(`No asset build found: run "npm run build" first`, { cause: err });
    return null;
  }
}

/** The build manifest, or null when the assets have not been built. */
export const manifest = loadManifest();

// URL path -> content hash. A Map, so arbitrary strings such as "constructor" can never hit inherited properties.
const hashes = new Map(Object.entries(manifest?.assets ?? {}));

// Matches a reference to an image or font such as /assets/img/scenes/hero-1.webp (also inside srcset lists, CSS url()
// and icons.svg#sprite fragments). The look-ahead keeps the match from swallowing whatever follows the file name.
const ASSET_REF = /\/assets\/(?:img|fonts)\/[\w./%-]+?\.(?:webp|png|jpe?g|gif|svg|ico|woff2?)(?=[#"'`\s),])/g;

/**
 * Append ?v=<content hash> to every image/font reference in `text` that the manifest knows about.
 * @param {string} text HTML, CSS or JavaScript source
 * @param {Map<string, string>} [table] URL path -> hash; defaults to the manifest's table
 */
export function versionUrls(text, table = hashes) {
  if (!table.size) return text;
  return text.replace(ASSET_REF, (url) => (table.has(url) ? `${url}?v=${table.get(url)}` : url));
}

/**
 * Version every string inside a JSON-able value that is exactly an asset URL, for example the image paths in the
 * catalogue. Free text (reviews, messages) is never rewritten, even if it happens to mention a file name.
 */
export function versionJson(value) {
  if (!hashes.size) return value;
  const walk = (v) => {
    if (typeof v === 'string') return hashes.has(v) ? `${v}?v=${hashes.get(v)}` : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value);
}

/**
 * Rewrite a finished HTML document for the production build: swap source entry points for their fingerprinted
 * bundles, preload the chunks the entry script is about to import, and version image/font URLs.
 */
export function rewriteHtml(html) {
  if (!manifest) return html;
  let out = html;
  const preloads = [];
  for (const [source, entry] of Object.entries(manifest.entries)) {
    if (!out.includes(source)) continue;
    out = out.replaceAll(source, entry.file);
    for (const chunk of entry.preload || []) preloads.push(`<link rel="modulepreload" href="${chunk}">`);
  }
  // the chunks of the page module itself, which the entry script would otherwise only discover after it has run
  const page = /<body[^>]*\bdata-page="(\w+)"/.exec(out)?.[1];
  for (const chunk of (page && manifest.pages?.[page]) || []) {
    preloads.push(`<link rel="modulepreload" href="${chunk}">`);
  }
  if (preloads.length) out = out.replace('</head>', `${[...new Set(preloads)].join('\n')}\n</head>`);
  return versionUrls(out);
}

/**
 * Cache-Control for a static file.
 *  - build output and ?v= fingerprinted assets never change under the same URL, so they are cached for a year
 *  - other assets may change, so they are revalidated after a day (stale copies are served while that happens)
 *  - without a build (development) nothing is cached, which keeps edits visible immediately
 */
export function cacheControlFor(urlPath, versioned) {
  if (!manifest) return 'no-cache';
  if (urlPath.startsWith(`${DIST_URL}/`) || (versioned && /^\/assets\/(?:img|fonts)\//.test(urlPath))) {
    return 'public, max-age=31536000, immutable';
  }
  if (/^\/assets\/(?:img|fonts)\//.test(urlPath)) return 'public, max-age=86400, stale-while-revalidate=604800';
  return 'no-cache';
}
