// Authentication primitives: scrypt password hashing, signed expiring tokens (used for the customer session and
// admin cookies) and the admin password.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { secretFile, adminFile, writeJsonAtomic } from './db.js';

const scrypt = promisify(crypto.scrypt);

// ---------------------------------------------------------------- signing key

const MIN_SECRET_LENGTH = 32;
let SECRET;

/**
 * The HMAC key used to sign cookies: DRINKIT_SECRET when set (so several instances can share one key), otherwise a
 * random key generated on first run and kept in data/secret.key.
 */
function secret() {
  if (SECRET) return SECRET;
  const fromEnv = process.env.DRINKIT_SECRET;
  if (fromEnv) {
    if (fromEnv.length < MIN_SECRET_LENGTH) {
      throw new Error(`DRINKIT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long`);
    }
    return (SECRET = fromEnv);
  }
  try {
    SECRET = fs.readFileSync(secretFile, 'utf8').trim();
  } catch {
    SECRET = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, SECRET, { mode: 0o600 });
  }
  return SECRET;
}

/**
 * Validate the security related configuration. Throws when it is unusable (so the server refuses to start) and
 * returns a list of warnings for settings that work but are weak.
 */
export function checkConfig() {
  secret();
  const warnings = [];
  const admin = process.env.DRINKIT_ADMIN_PASSWORD;
  if (admin !== undefined && admin.length < 12) {
    warnings.push('DRINKIT_ADMIN_PASSWORD is shorter than 12 characters - use a long random passphrase.');
  }
  return warnings;
}

// ---------------------------------------------------------------- signed tokens

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

/**
 * Create a signed token `base64url(json).signature`. The payload can be read by the client but not altered, and
 * the token stops working after `ttlSec` seconds.
 */
export function sign(payload, ttlSec) {
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  return `${body}.${hmac(body)}`;
}

/** Check the signature and expiry of a token. Returns the payload, or null for anything invalid. */
export function verify(token) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(hmac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- password hashing

/**
 * scrypt with N = 2^15, r = 8, p = 1: about 33 MB and 80 ms per hash, comfortably above the OWASP minimum.
 * The parameters are stored in every hash, so they can be raised later; older hashes keep working and are upgraded
 * the next time their owner logs in.
 */
const COST = { logN: 15, r: 8, p: 1 };
const LEGACY_COST = { logN: 14, r: 8, p: 1 }; // hashes written as `scrypt$salt$hash` before the format carried parameters
const KEY_LENGTH = 64;

/** Longer passwords are rejected by the API and ignored here, so hashing time cannot be inflated by the input. */
export const MAX_PASSWORD_LENGTH = 200;

// Each hash needs ~33 MB of memory; running only a few at a time stops a burst of logins from exhausting it.
const MAX_CONCURRENT_HASHES = 4;
let activeHashes = 0;
const waiting = [];
async function withSlot(task) {
  if (activeHashes >= MAX_CONCURRENT_HASHES) await new Promise((resolve) => waiting.push(resolve));
  activeHashes++;
  try {
    return await task();
  } finally {
    activeHashes--;
    waiting.shift()?.();
  }
}

const derive = (password, salt, { logN, r, p }) =>
  withSlot(() =>
    scrypt(String(password).slice(0, MAX_PASSWORD_LENGTH), salt, KEY_LENGTH, {
      N: 2 ** logN,
      r,
      p,
      maxmem: 256 * 2 ** logN * r,
    }),
  );

/** Split a stored hash into its parameters, salt and digest. Returns null if it is not one of ours. */
function parseHash(stored) {
  const parts = String(stored).split('$');
  if (parts[0] !== 'scrypt') return null;
  if (parts.length === 3) {
    return { ...LEGACY_COST, salt: Buffer.from(parts[1], 'base64'), hash: Buffer.from(parts[2], 'base64') };
  }
  if (parts.length === 6) {
    const [logN, r, p] = parts.slice(1, 4).map(Number);
    if (![logN, r, p].every(Number.isInteger) || logN < 10 || logN > 20 || r < 1 || r > 16 || p < 1 || p > 4)
      return null;
    return { logN, r, p, salt: Buffer.from(parts[4], 'base64'), hash: Buffer.from(parts[5], 'base64') };
  }
  return null;
}

/** Hash a password with a fresh random salt. Format: `scrypt$logN$r$p$salt$hash` (base64). */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await derive(password, salt, COST);
  return `scrypt$${COST.logN}$${COST.r}$${COST.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Check a password against a stored hash in constant time.
 * `rehash` is true when the hash was made with weaker parameters than the current ones.
 */
export async function verifyPassword(password, stored) {
  const parsed = parseHash(stored);
  if (!parsed) return { ok: false, rehash: false };
  try {
    const actual = await derive(password, parsed.salt, parsed);
    const ok = actual.length === parsed.hash.length && crypto.timingSafeEqual(actual, parsed.hash);
    const rehash = ok && (parsed.logN !== COST.logN || parsed.r !== COST.r || parsed.p !== COST.p);
    return { ok, rehash };
  } catch {
    return { ok: false, rehash: false };
  }
}

let dummy;
/**
 * A valid hash of a random password. Logging in with an unknown account still verifies against it, so the response
 * time does not reveal whether the account exists.
 */
export async function dummyHash() {
  dummy ||= hashPassword(crypto.randomBytes(12).toString('hex'));
  return dummy;
}

// ---------------------------------------------------------------- admin credential

let adminCache = { mtimeMs: -1, hash: '' };
/** The stored admin password hash (empty when none exists), re-read only when admin.json changes. */
function storedAdminHash() {
  try {
    const { mtimeMs } = fs.statSync(adminFile);
    if (mtimeMs !== adminCache.mtimeMs) {
      adminCache = { mtimeMs, hash: JSON.parse(fs.readFileSync(adminFile, 'utf8')).hash || '' };
    }
    return adminCache.hash;
  } catch {
    return '';
  }
}

/**
 * Identifies the current admin credential. It is stored in admin tokens, so changing the password (or running
 * `node server.js --reset-admin`) ends every existing admin session. It is keyed with the server secret, so a copy
 * of the cookie cannot be used to guess the password offline.
 */
export function adminVersion() {
  const material = process.env.DRINKIT_ADMIN_PASSWORD || storedAdminHash();
  return crypto.createHmac('sha256', secret()).update(`admin:${material}`).digest('base64url').slice(0, 12);
}

/**
 * Create data/admin.json with a random password on first run (or when `reset` is set).
 * Returns the plain text password only when one was created - it is shown once and never stored.
 */
export async function ensureAdmin({ reset = false } = {}) {
  if (process.env.DRINKIT_ADMIN_PASSWORD) return null; // the environment variable wins; nothing is stored
  if (!reset && fs.existsSync(adminFile)) return null;
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
  let password = '';
  for (let i = 0; i < 16; i++) password += alphabet[crypto.randomInt(alphabet.length)];
  writeJsonAtomic(adminFile, { hash: await hashPassword(password), createdAt: new Date().toISOString() });
  return password;
}

/** Check the admin password against DRINKIT_ADMIN_PASSWORD or the hash in data/admin.json. */
export async function verifyAdminPassword(password) {
  const candidate = String(password ?? '').slice(0, MAX_PASSWORD_LENGTH);
  const fromEnv = process.env.DRINKIT_ADMIN_PASSWORD;
  if (fromEnv) {
    // compare fixed-length digests so the comparison takes the same time whatever the input
    const a = crypto.createHash('sha256').update(candidate).digest();
    const b = crypto.createHash('sha256').update(fromEnv).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const hash = storedAdminHash();
  return hash ? (await verifyPassword(candidate, hash)).ok : false;
}
