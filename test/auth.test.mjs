// Unit tests for password hashing, signed tokens and the admin credential.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// The data folder and signing key are read when the modules load, so point them at a scratch directory first.
process.env.DRINKIT_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'drinkit-auth-'));
process.env.DRINKIT_SECRET = 'unit-test-secret-'.padEnd(48, 'x');
delete process.env.DRINKIT_ADMIN_PASSWORD;

const auth = await import('../server/auth.js');

describe('password hashing', () => {
  it('round-trips and records its parameters in the hash', async () => {
    const hash = await auth.hashPassword('correct horse battery staple');
    assert.match(hash, /^scrypt\$15\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.deepEqual(await auth.verifyPassword('correct horse battery staple', hash), { ok: true, rehash: false });
  });

  it('rejects a wrong password', async () => {
    const hash = await auth.hashPassword('right-password');
    assert.equal((await auth.verifyPassword('wrong-password', hash)).ok, false);
  });

  it('salts every hash differently', async () => {
    const [a, b] = await Promise.all([auth.hashPassword('same'), auth.hashPassword('same')]);
    assert.notEqual(a, b);
  });

  it('still accepts the old parameter-less format and asks for it to be upgraded', async () => {
    const salt = crypto.randomBytes(16);
    const digest = crypto.scryptSync('legacy-password', salt, 64, { N: 2 ** 14, r: 8, p: 1 });
    const legacy = `scrypt$${salt.toString('base64')}$${digest.toString('base64')}`;
    assert.deepEqual(await auth.verifyPassword('legacy-password', legacy), { ok: true, rehash: true });
    assert.equal((await auth.verifyPassword('other', legacy)).ok, false);
  });

  it('refuses malformed hashes, including ones that ask for an absurd amount of work', async () => {
    const salt = Buffer.from('salt').toString('base64');
    for (const stored of [
      '',
      'plain-text',
      'bcrypt$x$y',
      'scrypt$30$8$1$' + salt + '$AAAA',
      'scrypt$15$99$1$' + salt + '$AAAA',
    ]) {
      assert.deepEqual(await auth.verifyPassword('x', stored), { ok: false, rehash: false }, stored);
    }
  });

  it('only looks at the first MAX_PASSWORD_LENGTH characters', async () => {
    const long = 'a'.repeat(auth.MAX_PASSWORD_LENGTH);
    const hash = await auth.hashPassword(long);
    assert.equal((await auth.verifyPassword(long + 'tail', hash)).ok, true);
  });

  it('produces a usable dummy hash for unknown accounts', async () => {
    const dummy = await auth.dummyHash();
    assert.equal((await auth.verifyPassword('anything', dummy)).ok, false);
    assert.equal(await auth.dummyHash(), dummy);
  });
});

describe('signed tokens', () => {
  it('verifies an untouched token and returns its payload', () => {
    const token = auth.sign({ typ: 'session', uid: 'u1' }, 60);
    const payload = auth.verify(token);
    assert.equal(payload.typ, 'session');
    assert.equal(payload.uid, 'u1');
  });

  it('rejects a token whose payload was edited', () => {
    const [body, mac] = auth.sign({ typ: 'session', uid: 'u1' }, 60).split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), uid: 'admin' }),
    ).toString('base64url');
    assert.equal(auth.verify(`${forged}.${mac}`), null);
  });

  it('rejects a token with a wrong or truncated signature', () => {
    const token = auth.sign({ typ: 'session' }, 60);
    assert.equal(auth.verify(token.slice(0, -2) + 'AA'), null);
    assert.equal(auth.verify(token.slice(0, -5)), null);
  });

  it('rejects an expired token', () => {
    assert.equal(auth.verify(auth.sign({ typ: 'session' }, -1)), null);
  });

  it('rejects garbage of every shape', () => {
    for (const value of [undefined, null, 42, {}, '', '.', 'a.b.c', 'x'.repeat(5000)]) {
      assert.equal(auth.verify(value), null, String(value).slice(0, 20));
    }
  });
});

describe('admin credential', () => {
  const original = process.env.DRINKIT_ADMIN_PASSWORD;
  before(() => {
    delete process.env.DRINKIT_ADMIN_PASSWORD;
  });

  it('checks a password supplied through the environment', async () => {
    process.env.DRINKIT_ADMIN_PASSWORD = 'a-long-admin-passphrase';
    assert.equal(await auth.verifyAdminPassword('a-long-admin-passphrase'), true);
    assert.equal(await auth.verifyAdminPassword('a-long-admin-passphras'), false);
    assert.equal(await auth.verifyAdminPassword(''), false);
    assert.equal(await auth.verifyAdminPassword(undefined), false);
    if (original === undefined) delete process.env.DRINKIT_ADMIN_PASSWORD;
  });

  it('changes the session version when the password changes, which ends old admin sessions', () => {
    process.env.DRINKIT_ADMIN_PASSWORD = 'first-admin-passphrase';
    const first = auth.adminVersion();
    process.env.DRINKIT_ADMIN_PASSWORD = 'second-admin-passphrase';
    assert.notEqual(auth.adminVersion(), first);
    delete process.env.DRINKIT_ADMIN_PASSWORD;
  });

  it('generates a one-time password on first run, stores only its hash, and verifies it', async () => {
    const password = await auth.ensureAdmin();
    assert.match(password, /^[A-Za-z0-9]{16}$/);
    assert.equal(await auth.ensureAdmin(), null, 'a second call must not replace the password');
    assert.equal(await auth.verifyAdminPassword(password), true);
    assert.equal(await auth.verifyAdminPassword('not it'), false);
    const reset = await auth.ensureAdmin({ reset: true });
    assert.notEqual(reset, password);
    assert.equal(await auth.verifyAdminPassword(password), false);
  });
});

describe('configuration check', () => {
  const run = (env) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { checkConfig } from './server/auth.js'; console.log(JSON.stringify(checkConfig()));",
      ],
      {
        cwd: path.resolve(import.meta.dirname, '..'),
        env: { ...process.env, DRINKIT_DATA_DIR: process.env.DRINKIT_DATA_DIR, ...env },
        encoding: 'utf8',
      },
    );

  it('refuses to start with a signing secret that is too short', () => {
    const result = run({ DRINKIT_SECRET: 'short' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DRINKIT_SECRET must be at least 32 characters/);
  });

  it('warns about a short admin password but still starts', () => {
    const result = run({ DRINKIT_ADMIN_PASSWORD: 'tooshort' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRINKIT_ADMIN_PASSWORD is shorter than 12/);
  });
});
