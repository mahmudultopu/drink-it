// Small HTTP helpers: responses, JSON bodies, cookies, rate limiting, errors.
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
export const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.webmanifest']);

export function json(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

export async function readJson(req, limit = 200_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object') throw new Error('not an object');
    return parsed;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Behind HTTPS set DRINKIT_SECURE_COOKIES=1 (cookies get the Secure flag) and, behind a reverse proxy,
// DRINKIT_TRUST_PROXY=1 so rate limiting sees the real client address.
const SECURE_COOKIES = process.env.DRINKIT_SECURE_COOKIES === '1';
const TRUST_PROXY = process.env.DRINKIT_TRUST_PROXY === '1';

export function setCookie(res, name, value, { maxAge, httpOnly = true, sameSite = 'Lax', path = '/', secure = SECURE_COOKIES } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : parts.join('; '));
}

export function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}

// ---- in-memory sliding-window rate limiter ----
const hits = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) {
    const fresh = arr.filter((t) => now - t < 3_600_000);
    if (fresh.length) hits.set(k, fresh);
    else hits.delete(k);
  }
}, 600_000).unref();

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const randomId = (bytes = 8) => crypto.randomBytes(bytes).toString('hex');

/** trim + cap a user supplied string */
export function clean(v, max = 200) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/** Normalise a Bangladeshi mobile number to 01XXXXXXXXX, or return null. */
export function normalizePhone(input) {
  const digits = String(input || '').replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return m ? m[1] : null;
}

export const isEmail = (s) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(s);
