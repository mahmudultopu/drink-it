// HTTP and input helpers shared by the API and the page server: responses, JSON bodies, cookies,
// client addresses, rate limiting and input sanitising.
import crypto from 'node:crypto';
import net from 'node:net';
import { versionJson } from './assets.js';

/**
 * An error that maps directly onto an HTTP response.
 * `extra` is merged into the JSON error body (for example `{ fields }` for form errors) and
 * `headers` is added to the response (for example `Retry-After`).
 */
export class HttpError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message text that is safe to show to the visitor
   * @param {object} [extra]
   * @param {Record<string, string | number>} [headers]
   */
  constructor(status, message, extra = {}, headers = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
    this.headers = headers;
  }
}

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
};

/** File types worth compressing; images and fonts are already compressed. */
export const COMPRESSIBLE = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.map',
  '.svg',
  '.txt',
  '.xml',
  '.webmanifest',
]);

// ---------------------------------------------------------------- configuration

/**
 * Set DRINKIT_SECURE_COOKIES=1 when the site is served over HTTPS. Cookies then get the Secure flag and the
 * __Host- prefix (which stops sibling subdomains from overwriting them) and HSTS is sent.
 */
export const SECURE = process.env.DRINKIT_SECURE_COOKIES === '1';

/**
 * Number of trusted reverse proxies in front of the app. Use DRINKIT_TRUST_PROXY=1 for a single hop (Vercel,
 * nginx, Caddy, Cloudflare Tunnel...). With 0 the socket address is used and forwarding headers are ignored,
 * so a client cannot pick its own address.
 */
const PROXY_HOPS = Math.max(0, Math.floor(Number(process.env.DRINKIT_TRUST_PROXY) || 0));

/** Optional canonical origin (for example https://drinkit.com.bd) used in sitemap.xml and robots.txt. */
const CANONICAL_ORIGIN = (() => {
  try {
    return process.env.DRINKIT_PUBLIC_URL ? new URL(process.env.DRINKIT_PUBLIC_URL).origin : '';
  } catch {
    return '';
  }
})();

// ---------------------------------------------------------------- responses

/** Headers every response carries, whatever it is. */
export const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  ...(SECURE ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
};

/**
 * Send a JSON response. API responses are never cached and must not be sniffed as anything else. Image and font
 * URLs in the payload get their content hash appended, like the ones in the pages (see assets.js).
 */
export function json(res, status, obj, headers = {}) {
  const body = JSON.stringify(versionJson(obj));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...BASE_HEADERS,
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

/**
 * Read and parse a JSON request body (must be an object). The size is checked against the Content-Length header
 * first, so an oversized upload is refused without reading it, and again while streaming.
 */
export async function readJson(req, limit = 200_000) {
  if (Number(req.headers['content-length']) > limit) throw new HttpError(413, 'Request body too large');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  let text = size ? Buffer.concat(chunks).toString('utf8') : '';
  if (!size && req.body != null) {
    // Hosting runtimes such as Vercel may have drained the stream and parsed the body already.
    const b = req.body;
    text = typeof b === 'string' ? b : Buffer.isBuffer(b) ? b.toString('utf8') : JSON.stringify(b);
    if (text.length > limit) throw new HttpError(413, 'Request body too large');
  }
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

// ---------------------------------------------------------------- cookies

/** Cookie name for the current deployment: `__Host-` prefixed when served over HTTPS. */
export const cookieName = (name) => (SECURE ? `__Host-${name}` : name);

const safeDecode = (v) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v; // a malformed escape must not turn into a 500
  }
};

/** Parse the Cookie header into a plain object. Oversized headers are ignored. */
export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw || raw.length > 8192) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = safeDecode(part.slice(i + 1).trim());
  }
  return out;
}

/** Append a Set-Cookie header (HttpOnly + SameSite=Lax by default, Secure when SECURE is on). */
export function setCookie(
  res,
  name,
  value,
  { maxAge, httpOnly = true, sameSite = 'Lax', path = '/', secure = SECURE } = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : parts.join('; '));
}

// ---------------------------------------------------------------- client address and origin

/** The value PROXY_HOPS entries from the right of a comma separated forwarding header, if there is one. */
function forwarded(req, header) {
  if (!PROXY_HOPS) return '';
  const chain = String(req.headers[header] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Every trusted proxy appends the address it received the request from, so the real client is PROXY_HOPS
  // entries from the end. Anything further left was supplied by the client and cannot be trusted.
  return chain[chain.length - PROXY_HOPS] || '';
}

/** Address of the visitor, used as the rate limiting key. */
export function clientIp(req) {
  const direct = req.socket.remoteAddress || 'unknown';
  const candidate = forwarded(req, 'x-forwarded-for');
  return candidate && net.isIP(candidate) ? candidate : direct;
}

/**
 * Collapse an address to the unit an attacker can realistically rotate through: IPv6 clients usually get a whole /64,
 * so limiting single addresses would be trivial to bypass.
 */
export function rateKey(ip) {
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4) return v4[1];
  if (net.isIPv6(ip)) {
    const [head, tail = ''] = ip.split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    return groups.slice(0, 4).join(':') + '::/64';
  }
  return ip;
}

const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/** Scheme + host as the visitor sees it. A configured DRINKIT_PUBLIC_URL always wins over request headers. */
export function publicOrigin(req) {
  if (CANONICAL_ORIGIN) return CANONICAL_ORIGIN;
  const host = HOST_PATTERN.test(req.headers.host || '') ? req.headers.host : 'localhost';
  return `${forwarded(req, 'x-forwarded-proto') === 'https' ? 'https' : 'http'}://${host}`;
}

// ---------------------------------------------------------------- rate limiting

const windows = new Map(); // key -> timestamps of recent hits
const MAX_KEYS = 50_000; // bounds memory if somebody sprays requests from many addresses

function evict(map) {
  let n = 0;
  for (const k of map.keys()) {
    map.delete(k); // Maps iterate in insertion order, so these are the oldest keys
    if (++n >= MAX_KEYS / 10) break;
  }
}

/** Sliding-window limiter: allow at most `max` calls per `windowMs` for `key`. Returns false when over the limit. */
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const recent = (windows.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  if (windows.size > MAX_KEYS) evict(windows);
  return true;
}

/** Seconds until `key` may try again (for the Retry-After header). */
export function retryAfter(key, windowMs) {
  const oldest = (windows.get(key) || [])[0];
  return oldest ? Math.max(1, Math.ceil((oldest + windowMs - Date.now()) / 1000)) : 1;
}

/**
 * Counts failures (wrong passwords) per key and blocks the key once it reaches `max` within `windowMs`.
 * A success calls clear(), so ordinary users are never locked out by their own earlier typos.
 */
export class FailureTracker {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.failures = new Map();
  }
  recent(key) {
    const now = Date.now();
    const list = (this.failures.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }
  blocked(key) {
    return this.recent(key).length >= this.max;
  }
  retryAfter(key) {
    const oldest = this.recent(key)[0];
    return oldest ? Math.max(1, Math.ceil((oldest + this.windowMs - Date.now()) / 1000)) : 1;
  }
  record(key) {
    const list = this.recent(key);
    list.push(Date.now());
    this.failures.set(key, list);
    if (this.failures.size > MAX_KEYS) evict(this.failures);
  }
  clear(key) {
    this.failures.delete(key);
  }
}

// forget idle keys so the maps do not grow forever
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of windows) {
    const fresh = arr.filter((t) => now - t < 3_600_000);
    if (fresh.length) windows.set(k, fresh);
    else windows.delete(k);
  }
}, 600_000).unref();

// ---------------------------------------------------------------- text helpers

/** Escape text for safe use inside HTML (element content and quoted attributes). */
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** A random hex string, for identifiers that must be hard to guess (review and message ids). */
export const randomId = (bytes = 8) => crypto.randomBytes(bytes).toString('hex');

/**
 * Trim and cap a user supplied string. Control characters are replaced with spaces so a value can never
 * smuggle line breaks into log lines, response headers or CSV cells.
 */
export function clean(v, max = 200) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // eslint-disable-line no-control-regex
    .trim()
    .slice(0, max);
}

/** Normalise a Bangladeshi mobile number to 01XXXXXXXXX, or return null. */
export function normalizePhone(input) {
  const digits = String(input || '').replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return m ? m[1] : null;
}

/** Pragmatic address check (length-bounded so it cannot be abused for slow regex matching). */
export const isEmail = (s) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(s);
