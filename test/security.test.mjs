// End-to-end security tests: they start the real server and attack it the way a visitor (or an attacker) would.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, rawRequest, ADMIN_PASSWORD } from './support/server.mjs';

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const anonymous = () => new Client(server.base);
const register = async (name, phone, password = 'a-decent-password') => {
  const client = anonymous();
  const res = await client.post('/api/auth/register', { name, phone, password });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return client;
};
const adminClient = async () => {
  const client = anonymous();
  const res = await client.post('/api/admin/login', { password: ADMIN_PASSWORD });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return client;
};

describe('response headers', () => {
  it('sends a strict Content-Security-Policy and clickjacking protection on pages', async () => {
    const res = await anonymous().get('/');
    assert.equal(res.status, 200);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(
      csp,
      /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'(;|$)/,
      'only our own scripts and the pre-paint snippet',
    );
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });

  it('does not announce the server software', async () => {
    const res = await anonymous().get('/');
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('server'), null);
  });

  it('keeps the admin shell out of caches and search engines', async () => {
    const res = await anonymous().get('/admin');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('x-robots-tag'), /noindex/);
  });

  it('never caches per-visitor API responses', async () => {
    for (const url of ['/api/me', '/api/orders/lookup?number=x&phone=y', '/api/activity']) {
      const res = await anonymous().get(url);
      assert.equal(res.headers.get('cache-control'), 'no-store', url);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url);
    }
  });
});

describe('static file serving', () => {
  it('does not serve files from outside public/', async () => {
    const probes = [
      '/assets/%2e%2e/%2e%2e/server/db.js',
      '/assets/..%2f..%2fserver%2fdb.js',
      '/..%2fserver%2fdb.js',
      '/assets/..%5c..%5cserver%5cdb.js',
      '/assets/img/%00.webp',
      '/assets/../server/db.js',
    ];
    for (const probe of probes) {
      const res = await rawRequest(server.base, probe);
      assert.ok([400, 404].includes(res.status), `${probe} -> ${res.status}`);
      assert.doesNotMatch(res.body, /WatchedJson|writeJsonAtomic/, probe);
    }
  });

  it('hides source, data and dot files', async () => {
    for (const probe of [
      '/server.js',
      '/package.json',
      '/data/site.json',
      '/server/auth.js',
      '/.env',
      '/.git/config',
    ]) {
      const res = await anonymous().get(probe);
      assert.equal(res.status, 404, probe);
    }
  });

  it('refuses methods other than GET and HEAD on pages', async () => {
    const res = await anonymous().post('/', {});
    assert.equal(res.status, 405);
  });

  it('answers HEAD without a body', async () => {
    const res = await rawRequest(server.base, '/', { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.body, '');
  });

  it('rejects absurdly long URLs', async () => {
    const res = await rawRequest(server.base, `/${'a'.repeat(5000)}`);
    assert.equal(res.status, 414);
  });

  it('escapes content it reflects into pages', async () => {
    const res = await anonymous().get('/products/%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
    assert.equal(res.status, 200); // the shell renders and the client shows "not found"
    assert.doesNotMatch(res.body, /<img src=x onerror/);
  });
});

describe('request validation', () => {
  it('requires a JSON content type on writes', async () => {
    const res = await anonymous().request('POST', '/api/newsletter', {
      body: 'email=a@b.co',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(res.status, 415);
  });

  it('refuses cross-site requests that change state', async () => {
    const cross = await anonymous().post(
      '/api/newsletter',
      { email: 'x@example.com' },
      { headers: { 'sec-fetch-site': 'cross-site' } },
    );
    assert.equal(cross.status, 403);
    const sameSite = await anonymous().post(
      '/api/newsletter',
      { email: 'x@example.com' },
      { headers: { 'sec-fetch-site': 'same-site' } },
    );
    assert.equal(sameSite.status, 403, 'a sibling subdomain is not our origin either');
    const evilOrigin = await anonymous().post(
      '/api/newsletter',
      { email: 'x@example.com' },
      { headers: { origin: 'https://evil.example' } },
    );
    assert.equal(evilOrigin.status, 403);
  });

  it('accepts same-origin requests', async () => {
    const own = await anonymous().post(
      '/api/newsletter',
      { email: 'own@example.com' },
      { headers: { 'sec-fetch-site': 'same-origin', origin: server.base } },
    );
    assert.equal(own.status, 201);
  });

  it('refuses oversized bodies before reading them', async () => {
    const res = await anonymous().post('/api/contact', { message: 'x'.repeat(300_000) });
    assert.equal(res.status, 413);
  });

  it('rejects malformed JSON and non-object bodies with 400', async () => {
    const bad = await anonymous().request('POST', '/api/contact', {
      body: '{nope',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(bad.status, 400);
    const array = await anonymous().request('POST', '/api/contact', {
      body: '[1,2]',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(array.status, 400);
  });

  it('answers 404/405 for unknown routes instead of crashing', async () => {
    assert.equal((await anonymous().get('/api/nope')).status, 404);
    assert.equal((await anonymous().request('DELETE', '/api/faq')).status, 405);
    assert.equal((await anonymous().get('/api/products/%E0%A4%A')).status, 400, 'malformed escape is a client error');
  });

  it('does not treat inherited object properties as pages or products', async () => {
    assert.equal((await anonymous().get('/api/pages/constructor')).status, 404);
    assert.equal((await anonymous().get('/api/pages/__proto__')).status, 404);
    assert.equal((await anonymous().get('/api/products/constructor')).status, 404);
  });

  it('hides internal error details', async () => {
    const res = await anonymous().get('/api/orders/lookup?number=%00&phone=x');
    assert.equal(res.status, 404);
    assert.doesNotMatch(JSON.stringify(res.body), /at .*\.js|ENOENT|stack/i);
  });
});

describe('accounts and sessions', () => {
  it('stores a session in an HttpOnly, SameSite cookie and never returns the password hash', async () => {
    const client = anonymous();
    const res = await client.post('/api/auth/register', {
      name: 'Test One',
      phone: '01710000001',
      password: 'a-decent-password',
    });
    assert.equal(res.status, 201);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('di_session='));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(JSON.stringify(res.body), /passwordHash|scrypt/);
    const me = await client.get('/api/me');
    assert.equal(me.body.user.phone, '01710000001');
    assert.doesNotMatch(JSON.stringify(me.body), /passwordHash|scrypt/);
  });

  it('rejects weak or oversized passwords and invalid phone numbers', async () => {
    const weak = await anonymous().post('/api/auth/register', {
      name: 'Weak',
      phone: '01710000002',
      password: 'short',
    });
    assert.equal(weak.status, 422);
    assert.ok(weak.body.fields.password);
    const long = await anonymous().post('/api/auth/register', {
      name: 'Long',
      phone: '01710000003',
      password: 'p'.repeat(201),
    });
    assert.equal(long.status, 422);
    const phone = await anonymous().post('/api/auth/register', {
      name: 'Phone',
      phone: '12345',
      password: 'a-decent-password',
    });
    assert.equal(phone.status, 422);
    assert.ok(phone.body.fields.phone);
  });

  it('does not allow a second account on the same phone number', async () => {
    await register('Dup One', '01710000004');
    const again = await anonymous().post('/api/auth/register', {
      name: 'Dup Two',
      phone: '01710000004',
      password: 'a-decent-password',
    });
    assert.equal(again.status, 422);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await register('Same Answer', '01710000005');
    const wrong = await anonymous().post('/api/auth/login', { id: '01710000005', password: 'not-the-password' });
    const unknown = await anonymous().post('/api/auth/login', { id: '01799999999', password: 'not-the-password' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
  });

  it('ends the session on logout', async () => {
    const client = await register('Logout', '01710000006');
    assert.ok((await client.get('/api/me')).body.user);
    await client.post('/api/auth/logout', {});
    assert.equal((await client.get('/api/me')).body.user, null);
  });

  it('rejects a tampered session cookie', async () => {
    const client = await register('Tamper', '01710000007');
    const mac = client.cookies.get('di_session').split('.')[1];
    const forged = Buffer.from(JSON.stringify({ typ: 'session', uid: 'someone-else', exp: 9999999999 })).toString(
      'base64url',
    );
    const res = await anonymous().get('/api/me', { headers: { cookie: `di_session=${forged}.${mac}` } });
    assert.equal(res.body.user, null);
  });

  it('locks out a visitor who keeps guessing, and says when to retry', async () => {
    await register('Lockout', '01710000008', 'the-right-password');
    const guesser = anonymous();
    for (let i = 0; i < 5; i++) {
      const res = await guesser.post('/api/auth/login', { id: '01710000008', password: `guess-${i}` });
      assert.equal(res.status, 401);
    }
    const blocked = await guesser.post('/api/auth/login', { id: '01710000008', password: 'the-right-password' });
    assert.equal(blocked.status, 429, 'even the correct password is refused during the lock-out');
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  });

  it('does not let a stranger lock the real owner out of their account', async () => {
    await register('Owner', '01710000009', 'owners-password-1');
    const stranger = anonymous();
    for (let i = 0; i < 6; i++) await stranger.post('/api/auth/login', { id: '01710000009', password: `guess-${i}` });
    assert.equal((await stranger.post('/api/auth/login', { id: '01710000009', password: 'x' })).status, 429);
    const owner = anonymous();
    const res = await owner.post('/api/auth/login', { id: '01710000009', password: 'owners-password-1' });
    assert.equal(res.status, 200);
  });
});

describe('authorisation', () => {
  it('protects every admin endpoint', async () => {
    const endpoints = [
      ['GET', '/api/admin/stats'],
      ['GET', '/api/admin/orders'],
      ['GET', '/api/admin/orders.csv'],
      ['GET', '/api/admin/products'],
      ['GET', '/api/admin/reviews'],
      ['GET', '/api/admin/messages'],
      ['GET', '/api/admin/subscribers'],
      ['GET', '/api/admin/customers'],
      ['PATCH', '/api/admin/orders/abc'],
      ['PATCH', '/api/admin/products/coca-cola-original-250ml-can'],
      ['PATCH', '/api/admin/reviews/abc'],
      ['DELETE', '/api/admin/reviews/abc'],
      ['PATCH', '/api/admin/messages/abc'],
    ];
    for (const [method, url] of endpoints) {
      const res = await anonymous().request(method, url, method === 'GET' ? {} : { json: {} });
      assert.equal(res.status, 401, `${method} ${url}`);
    }
  });

  it('does not accept a customer session as an admin session', async () => {
    const customer = await register('Not Admin', '01710000010');
    const forged = anonymous();
    forged.cookies.set('di_admin', customer.cookies.get('di_session'));
    const res = await forged.get('/api/admin/stats');
    assert.equal(res.status, 401);
  });

  it('does not accept an admin session as a customer session', async () => {
    const admin = await adminClient();
    const forged = anonymous();
    forged.cookies.set('di_session', admin.cookies.get('di_admin'));
    const res = await forged.get('/api/me');
    assert.equal(res.body.user, null);
  });
});

describe('order privacy', () => {
  it('only shows an account the orders placed while logged into it', async () => {
    const guest = anonymous();
    const placed = await guest.post('/api/orders', orderBody('01720000001'));
    assert.equal(placed.status, 201, JSON.stringify(placed.body));

    // Someone registers with the same phone number (accounts do not verify ownership) - they must not see the order.
    const impostor = await register('Impostor', '01720000001');
    const mine = await impostor.get('/api/me/orders');
    assert.equal(mine.status, 200);
    assert.equal(mine.body.orders.length, 0);
  });

  it('looks orders up only with the right phone number', async () => {
    const guest = anonymous();
    const placed = await guest.post('/api/orders', orderBody('01720000002'));
    const number = placed.body.order.number;
    assert.equal((await guest.get(`/api/orders/lookup?number=${number}&phone=01720000002`)).status, 200);
    assert.equal((await guest.get(`/api/orders/lookup?number=${number}&phone=01720000003`)).status, 404);
    assert.equal((await guest.get(`/api/orders/lookup?number=${number}`)).status, 404);
  });

  it('lets a signed-in customer open their own order without the phone number, and nobody else', async () => {
    const owner = await register('Order Owner', '01720000006');
    const placed = await owner.post('/api/orders', orderBody('01720000006'));
    const number = placed.body.order.number;
    assert.equal((await owner.get(`/api/orders/lookup?number=${number}`)).status, 200);

    const other = await register('Other Customer', '01720000007');
    assert.equal((await other.get(`/api/orders/lookup?number=${number}`)).status, 404);
    assert.equal((await anonymous().get(`/api/orders/lookup?number=${number}`)).status, 404);
  });

  it('keeps internal fields out of customer-facing orders', async () => {
    const client = await register('Fields', '01720000004');
    const placed = await client.post('/api/orders', orderBody('01720000004'));
    assert.equal(placed.status, 201);
    assert.equal(placed.body.order.adminNote, undefined);
    assert.equal(placed.body.order.userId, undefined);
    const listed = await client.get('/api/me/orders');
    assert.equal(listed.body.orders.length, 1);
    assert.equal(listed.body.orders[0].adminNote, undefined);
  });

  it('does not reveal customer details in the public activity feed', async () => {
    const res = await anonymous().get('/api/activity');
    assert.equal(res.status, 200);
    assert.doesNotMatch(JSON.stringify(res.body), /01720000001|Impostor|phone|address/i);
  });
});

describe('spreadsheet export', () => {
  it('neutralises formulas so opening the CSV cannot run them', async () => {
    const guest = anonymous();
    const body = orderBody('01720000005');
    body.customer.name = '=HYPERLINK("http://evil.example","click")';
    body.shipping.area = '@Gulshan';
    const placed = await guest.post('/api/orders', body);
    assert.equal(placed.status, 201, JSON.stringify(placed.body));

    const admin = await adminClient();
    const csv = await admin.get('/api/admin/orders.csv');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.headers.get('content-disposition'), /attachment/);
    assert.ok(csv.body.includes(`"'=HYPERLINK(""http://evil.example"",""click"")"`), csv.body);
    assert.ok(csv.body.includes(`"'@Gulshan, `), 'cells starting with @ are prefixed too');
    assert.ok(!/(^|,)"[=+\-@]/m.test(csv.body), 'no cell may start with a formula character');
  });
});

describe('abuse limits', () => {
  it('rate limits newsletter sign-ups per visitor', async () => {
    const client = anonymous();
    let last;
    for (let i = 0; i < 12; i++) last = await client.post('/api/newsletter', { email: `rate${i}@example.com` });
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers.get('retry-after')) >= 1);
  });

  it('holds reviews for moderation instead of publishing them', async () => {
    const handle = 'coca-cola-original-250ml-can';
    const before = (await anonymous().get(`/api/reviews?product=${handle}`)).body.reviews.length;
    const sent = await anonymous().post('/api/reviews', {
      product: handle,
      name: 'Reviewer',
      rating: 5,
      title: '<b>great</b>',
      body: 'Really cold and fizzy.',
    });
    assert.equal(sent.status, 201);
    const after = (await anonymous().get(`/api/reviews?product=${handle}`)).body.reviews.length;
    assert.equal(after, before, 'the review stays hidden until an administrator approves it');

    const admin = await adminClient();
    const pending = (await admin.get('/api/admin/reviews')).body.reviews.find((r) => r.name === 'Reviewer');
    assert.ok(pending && pending.approved === false);
    await admin.patch(`/api/admin/reviews/${pending.id}`, { approved: true });
    const published = (await anonymous().get(`/api/reviews?product=${handle}`)).body.reviews;
    assert.equal(published.length, before + 1);
  });
});

describe('admin brute force protection', () => {
  it('rejects a wrong admin password and rate limits repeated guesses', async () => {
    const client = anonymous();
    for (let i = 0; i < 6; i++) {
      const res = await client.post('/api/admin/login', { password: `guess-${i}` });
      assert.equal(res.status, 401);
    }
    const blocked = await client.post('/api/admin/login', { password: ADMIN_PASSWORD });
    assert.equal(blocked.status, 429, 'even the right password is refused while locked out');
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  });
});

/** A valid cash-on-delivery order for one can of Coca-Cola. */
function orderBody(phone) {
  return {
    items: [{ handle: 'coca-cola-original-250ml-can', pack: 'single', qty: 1 }],
    customer: { name: 'Test Customer', phone },
    shipping: { division: 'Dhaka', district: 'Dhaka', area: 'Gulshan', address: 'House 1, Road 2' },
    payment: { method: 'cod' },
  };
}
