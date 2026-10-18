// Unit tests for the request/input helpers in server/util.js.
// DRINKIT_TRUST_PROXY must be set before the module is loaded because it is read once at import time.
process.env.DRINKIT_TRUST_PROXY = '1';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { clean, clientIp, esc, FailureTracker, isEmail, normalizePhone, parseCookies, rateKey, rateLimit, retryAfter } =
  await import('../server/util.js');

describe('normalizePhone', () => {
  it('accepts the common ways of writing a Bangladeshi mobile number', () => {
    for (const input of ['01712345678', '+8801712345678', '8801712345678', '017-1234 5678', ' 01712345678 ']) {
      assert.equal(normalizePhone(input), '01712345678', input);
    }
  });

  it('rejects numbers that cannot be a mobile line', () => {
    for (const input of ['', null, undefined, '12345', '01212345678', '0171234567', '017123456789', 'abcdefghijk']) {
      assert.equal(normalizePhone(input), null, String(input));
    }
  });
});

describe('clean', () => {
  it('trims, caps the length and tolerates missing values', () => {
    assert.equal(clean('  hello  '), 'hello');
    assert.equal(clean('abcdef', 3), 'abc');
    assert.equal(clean(undefined), '');
    assert.equal(clean(null), '');
    assert.equal(clean(42), '42');
  });

  it('replaces control characters so values cannot inject line breaks', () => {
    assert.equal(clean('a\r\nSet-Cookie: x=1'), 'a  Set-Cookie: x=1');
    assert.equal(clean('tab\tand\0nul'), 'tab and nul');
  });
});

describe('isEmail', () => {
  it('accepts ordinary addresses and rejects obvious junk', () => {
    assert.ok(isEmail('someone@example.com'));
    assert.ok(isEmail('first.last+tag@mail.example.co.bd'));
    for (const bad of ['', 'plain', 'a@b', 'a b@example.com', '@example.com', 'a@@example.com']) {
      assert.ok(!isEmail(bad), bad);
    }
  });

  it('does not backtrack catastrophically on long input', () => {
    const started = Date.now();
    isEmail(`${'a'.repeat(5000)}@${'b'.repeat(5000)}`);
    assert.ok(Date.now() - started < 200);
  });
});

describe('esc', () => {
  it('escapes the characters that matter in HTML', () => {
    assert.equal(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
    assert.equal(esc(null), '');
  });
});

describe('parseCookies', () => {
  const req = (cookie) => ({ headers: { cookie } });

  it('reads name/value pairs', () => {
    assert.deepEqual(parseCookies(req('a=1; b=two%20words')), { a: '1', b: 'two words' });
  });

  it('survives malformed percent escapes instead of throwing', () => {
    assert.deepEqual(parseCookies(req('bad=%E0%A4%A')), { bad: '%E0%A4%A' });
  });

  it('ignores absurdly large headers', () => {
    assert.deepEqual(parseCookies(req(`a=${'x'.repeat(9000)}`)), {});
  });

  it('copes with a missing header', () => {
    assert.deepEqual(parseCookies({ headers: {} }), {});
  });
});

describe('rateKey', () => {
  it('leaves IPv4 addresses alone and unwraps IPv4-mapped IPv6', () => {
    assert.equal(rateKey('203.0.113.9'), '203.0.113.9');
    assert.equal(rateKey('::ffff:203.0.113.9'), '203.0.113.9');
  });

  it('groups IPv6 addresses by /64 so rotating the host part does not escape a limit', () => {
    const a = rateKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    const b = rateKey('2001:db8:1:2:1111:2222:3333:4444');
    assert.equal(a, b);
    assert.notEqual(a, rateKey('2001:db8:1:3:aaaa:bbbb:cccc:dddd'));
    assert.equal(rateKey('2001:db8::1'), '2001:db8:0:0::/64');
  });
});

describe('clientIp', () => {
  const req = (xff, remote = '10.0.0.1') => ({
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    socket: { remoteAddress: remote },
  });

  it('uses the address the trusted proxy appended, not whatever the client claimed', () => {
    assert.equal(clientIp(req('9.9.9.9, 198.51.100.7')), '198.51.100.7');
  });

  it('falls back to the socket address without a usable header', () => {
    assert.equal(clientIp(req(undefined)), '10.0.0.1');
    assert.equal(clientIp(req('not-an-ip')), '10.0.0.1');
  });
});

describe('rateLimit', () => {
  it('allows up to the limit, then refuses, and reports when to retry', () => {
    const key = `unit:${Math.random()}`;
    for (let i = 0; i < 3; i++) assert.equal(rateLimit(key, 3, 60_000), true);
    assert.equal(rateLimit(key, 3, 60_000), false);
    const wait = retryAfter(key, 60_000);
    assert.ok(wait >= 1 && wait <= 60, `retry after ${wait}`);
  });

  it('keeps separate budgets per key', () => {
    const a = `unit:${Math.random()}`;
    const b = `unit:${Math.random()}`;
    assert.equal(rateLimit(a, 1, 60_000), true);
    assert.equal(rateLimit(a, 1, 60_000), false);
    assert.equal(rateLimit(b, 1, 60_000), true);
  });
});

describe('FailureTracker', () => {
  it('blocks a key after too many failures and unblocks it on success', () => {
    const tracker = new FailureTracker(3, 60_000);
    for (let i = 0; i < 2; i++) tracker.record('k');
    assert.equal(tracker.blocked('k'), false);
    tracker.record('k');
    assert.equal(tracker.blocked('k'), true);
    assert.ok(tracker.retryAfter('k') >= 1);
    tracker.clear('k');
    assert.equal(tracker.blocked('k'), false);
  });

  it('does not count failures that fall outside the window', async () => {
    const tracker = new FailureTracker(2, 30);
    tracker.record('k');
    tracker.record('k');
    assert.equal(tracker.blocked('k'), true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(tracker.blocked('k'), false);
  });
});
