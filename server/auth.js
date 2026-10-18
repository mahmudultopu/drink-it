// Password hashing (scrypt), signed cookies and the admin password.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { secretFile, adminFile, writeJsonAtomic } from './db.js';

let SECRET;
function secret() {
  if (!SECRET) {
    if (process.env.DRINKIT_SECRET) {
      SECRET = process.env.DRINKIT_SECRET; // one signing key shared by every server instance
    } else {
      try {
        SECRET = fs.readFileSync(secretFile, 'utf8').trim();
      } catch {
        SECRET = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(secretFile, SECRET, { mode: 0o600 });
      }
    }
  }
  return SECRET;
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

/** Signed, expiring token: base64url(json).mac */
export function sign(payload, ttlSec) {
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  return `${body}.${hmac(body)}`;
}

export function verify(token) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = hmac(body);
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------- admin password ----------
/** Creates data/admin.json with a random password on first run. Returns the plaintext only when created. */
export function ensureAdmin({ reset = false } = {}) {
  if (process.env.DRINKIT_ADMIN_PASSWORD) return null; // env var wins; nothing stored
  if (!reset && fs.existsSync(adminFile)) return null;
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pw = '';
  for (const byte of crypto.randomBytes(12)) pw += alphabet[byte % alphabet.length];
  writeJsonAtomic(adminFile, { hash: hashPassword(pw), createdAt: new Date().toISOString() });
  return pw;
}

export function verifyAdminPassword(password) {
  if (process.env.DRINKIT_ADMIN_PASSWORD) {
    const a = crypto.createHash('sha256').update(String(password)).digest();
    const b = crypto.createHash('sha256').update(process.env.DRINKIT_ADMIN_PASSWORD).digest();
    return crypto.timingSafeEqual(a, b);
  }
  try {
    const { hash } = JSON.parse(fs.readFileSync(adminFile, 'utf8'));
    return verifyPassword(String(password), hash);
  } catch {
    return false;
  }
}
