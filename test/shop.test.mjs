// End-to-end tests for the shop itself: catalogue, server-side pricing, stock, coupons, payments and order tracking.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, ADMIN_PASSWORD } from './support/server.mjs';

const COLA = 'coca-cola-original-250ml-can'; // 70 per can, 399 per 6-pack, plenty of stock in the seed data

let server;
before(async () => {
  server = await startServer();
});
after(() => server.stop());

const visitor = () => new Client(server.base);
const phoneGen = (() => {
  let n = 0;
  return () => `0175${String(++n).padStart(7, '0')}`;
})();

/** A valid checkout request; `overrides` replaces whole top-level sections. */
function checkout(overrides = {}) {
  return {
    items: [{ handle: COLA, pack: 'single', qty: 1 }],
    customer: { name: 'Rahim Uddin', phone: phoneGen() },
    shipping: { division: 'Dhaka', district: 'Dhaka', area: 'Mirpur', address: 'House 12, Road 3' },
    payment: { method: 'cod' },
    ...overrides,
  };
}
const stockOf = async (client, handle) => (await client.get(`/api/products/${handle}`)).body.stock;
const adminClient = async () => {
  const client = visitor();
  assert.equal((await client.post('/api/admin/login', { password: ADMIN_PASSWORD })).status, 200);
  return client;
};

describe('catalogue', () => {
  it('serves the storefront data without internal fields', async () => {
    const res = await visitor().get('/api/catalogue');
    assert.equal(res.status, 200);
    assert.ok(res.body.products.length > 20);
    assert.ok(res.body.collections.length > 3);
    assert.equal(res.body.user, undefined, 'the catalogue is shared between visitors, so it carries no visitor data');
    assert.doesNotMatch(JSON.stringify(res.body), /passwordHash|adminNote/);
    for (const p of res.body.posts) assert.equal(p.body, undefined, 'article bodies are fetched on demand');
  });

  it('reports no customer to an anonymous visitor', async () => {
    const res = await visitor().get('/api/me');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { user: null });
  });

  it('returns product detail and 404s for unknown handles', async () => {
    const ok = await visitor().get(`/api/products/${COLA}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.handle, COLA);
    assert.equal((await visitor().get('/api/products/does-not-exist')).status, 404);
  });

  it('generates a sitemap and robots.txt from the canonical host', async () => {
    const sitemap = await visitor().get('/sitemap.xml');
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.body, new RegExp(`<loc>${server.base}/products/${COLA}</loc>`));
    const robots = await visitor().get('/robots.txt');
    assert.match(robots.body, /Disallow: \/admin/);
    assert.match(robots.body, /Disallow: \/api\//);
  });

  it('puts product details into the page head for link previews', async () => {
    const res = await visitor().get(`/products/${COLA}`);
    assert.equal(res.status, 200);
    assert.match(res.body, /<title>[^<]*Coca-Cola[^<]*<\/title>/);
    assert.match(res.body, /property="og:title"/);
  });
});

describe('pricing is decided by the server', () => {
  it('prices a basket from the catalogue and ignores any prices the client sends', async () => {
    const res = await visitor().post('/api/quote', {
      items: [{ handle: COLA, pack: 'pack6', qty: 2, price: 1, unitPrice: 1, lineTotal: 1 }],
      shipping: { division: 'Dhaka', district: 'Dhaka' },
    });
    assert.equal(res.status, 200);
    const { quote } = res.body;
    assert.equal(quote.subtotal, 798); // 2 x 399
    assert.equal(quote.delivery, 60);
    assert.equal(quote.total, 858);
    assert.equal(quote.cans, 12);
  });

  it('charges more for delivery outside Dhaka and nothing above the free-delivery threshold', async () => {
    const outside = await visitor().post('/api/quote', {
      items: [{ handle: COLA, pack: 'single', qty: 1 }],
      shipping: { division: 'Sylhet', district: 'Sylhet' },
    });
    assert.equal(outside.body.quote.delivery, 120);
    const big = await visitor().post('/api/quote', {
      items: [{ handle: COLA, pack: 'pack24', qty: 2 }],
      shipping: { division: 'Sylhet', district: 'Sylhet' },
    });
    assert.equal(big.body.quote.delivery, 0);
  });

  it('rejects malformed baskets', async () => {
    const bad = [
      [],
      'nope',
      [{ handle: COLA, pack: 'single', qty: 0 }],
      [{ handle: COLA, pack: 'single', qty: -3 }],
      [{ handle: COLA, pack: 'single', qty: 100 }],
      [{ handle: COLA, pack: 'single', qty: 'abc' }],
      [{ handle: 'ghost-drink', pack: 'single', qty: 1 }],
      [{ handle: COLA, pack: 'pack99', qty: 1 }],
      [{ pack: 'single', qty: 1 }],
      Array.from({ length: 61 }, () => ({ handle: COLA, pack: 'single', qty: 1 })),
    ];
    for (const items of bad) {
      const res = await visitor().post('/api/quote', { items });
      assert.equal(res.status, 422, JSON.stringify(items).slice(0, 80));
    }
  });

  it('caps the size of a single order', async () => {
    const res = await visitor().post('/api/quote', { items: [{ handle: COLA, pack: 'pack24', qty: 30 }] });
    assert.equal(res.status, 422);
    assert.match(res.body.error, /at most/);
  });
});

describe('coupons', () => {
  it('applies a fixed coupon and enforces its minimum', async () => {
    const ok = await visitor().post('/api/quote', {
      items: [{ handle: COLA, pack: 'pack6', qty: 2 }],
      coupon: 'welcome50',
    });
    assert.equal(ok.body.quote.discount, 50);
    assert.equal(ok.body.quote.coupon.code, 'WELCOME50');
    const small = await visitor().post('/api/quote', {
      items: [{ handle: COLA, pack: 'single', qty: 1 }],
      coupon: 'WELCOME50',
    });
    assert.equal(small.status, 200, 'an unusable coupon must not block the basket preview');
    assert.ok(small.body.quote.couponError);
    assert.equal(small.body.quote.discount, 0);
  });

  it('applies a capped percentage coupon', async () => {
    const res = await visitor().post('/api/quote', {
      items: [{ handle: COLA, pack: 'pack24', qty: 5 }],
      coupon: 'DRINKIT10',
    });
    assert.equal(res.body.quote.discount, 300); // 10% of 7560 would be 756, capped at 300
  });

  it('refuses an unknown code at checkout', async () => {
    const res = await visitor().post('/api/orders', checkout({ coupon: 'NOPE' }));
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.coupon);
  });

  it('lets the welcome coupon be used once per phone number', async () => {
    const phone = phoneGen();
    const body = () =>
      checkout({
        items: [{ handle: COLA, pack: 'pack6', qty: 2 }],
        customer: { name: 'First Timer', phone },
        coupon: 'WELCOME50',
      });
    const first = await visitor().post('/api/orders', body());
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.order.pricing.discount, 50);
    const second = await visitor().post('/api/orders', body());
    assert.equal(second.status, 422);
    assert.match(second.body.error, /already been used/);
  });

  it('frees the welcome coupon again when the order that used it is cancelled', async () => {
    const phone = phoneGen();
    const body = () =>
      checkout({
        items: [{ handle: COLA, pack: 'pack6', qty: 2 }],
        customer: { name: 'Changed Mind', phone },
        coupon: 'WELCOME50',
      });
    const first = await visitor().post('/api/orders', body());
    const admin = await adminClient();
    await admin.patch(`/api/admin/orders/${first.body.order.id}`, { status: 'cancelled' });
    assert.equal((await visitor().post('/api/orders', body())).status, 201);
  });
});

describe('placing orders', () => {
  it('creates a cash-on-delivery order, reserves stock and lets the customer track it', async () => {
    const client = visitor();
    const before = await stockOf(client, COLA);
    const phone = phoneGen();
    const placed = await client.post(
      '/api/orders',
      checkout({ items: [{ handle: COLA, pack: 'pack6', qty: 2 }], customer: { name: 'Karim', phone } }),
    );
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const { order } = placed.body;
    assert.match(order.number, /^DI-\d{6}-[A-Z2-9]{4}$/);
    assert.equal(order.status, 'placed');
    assert.equal(order.payment.status, 'cod');
    assert.equal(order.pricing.total, 798 + 60);
    assert.equal(await stockOf(client, COLA), before - 12);

    const tracked = await client.get(`/api/orders/lookup?number=${order.number.toLowerCase()}&phone=${phone}`);
    assert.equal(tracked.status, 200);
    assert.equal(tracked.body.order.number, order.number);
  });

  it('validates the delivery address and customer details', async () => {
    const res = await visitor().post('/api/orders', {
      items: [{ handle: COLA, pack: 'single', qty: 1 }],
      customer: { name: 'X', phone: '123' },
      shipping: { division: 'Atlantis', district: 'Nowhere', area: '', address: '' },
      payment: { method: 'cod' },
    });
    assert.equal(res.status, 422);
    for (const field of ['name', 'phone', 'division', 'area', 'address']) assert.ok(res.body.fields[field], field);
  });

  it('refuses a district that does not belong to the chosen division', async () => {
    const res = await visitor().post(
      '/api/orders',
      checkout({ shipping: { division: 'Dhaka', district: 'Sylhet', area: 'Mirpur', address: 'House 12' } }),
    );
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.district);
  });

  it('does not let division or payment names resolve to inherited object properties', async () => {
    const division = await visitor().post(
      '/api/orders',
      checkout({ shipping: { division: 'constructor', district: 'x', area: 'Mirpur', address: 'House 12' } }),
    );
    assert.equal(division.status, 422);
    const payment = await visitor().post('/api/orders', checkout({ payment: { method: '__proto__' } }));
    assert.equal(payment.status, 422);
    assert.ok(payment.body.fields.method);
  });

  it('returns 409 with the remaining stock when a product runs short', async () => {
    const admin = await adminClient();
    await admin.patch('/api/admin/products/' + COLA, { stock: 5 });
    const res = await visitor().post('/api/orders', checkout({ items: [{ handle: COLA, pack: 'pack6', qty: 1 }] }));
    assert.equal(res.status, 409);
    assert.match(res.body.error, /Only 5 cans/);
    await admin.patch('/api/admin/products/' + COLA, { stock: 640 });
  });

  it('puts the cans back when an administrator cancels an order', async () => {
    const client = visitor();
    const placed = await client.post('/api/orders', checkout({ items: [{ handle: COLA, pack: 'pack6', qty: 1 }] }));
    const afterOrder = await stockOf(client, COLA);
    const admin = await adminClient();
    const cancelled = await admin.patch(`/api/admin/orders/${placed.body.order.id}`, {
      status: 'cancelled',
      note: 'customer called',
    });
    assert.equal(cancelled.status, 200);
    assert.equal(await stockOf(client, COLA), afterOrder + 6);
  });
});

describe('mobile money payments', () => {
  const paid = (trxId, method = 'bkash') => checkout({ payment: { method, trxId, sender: '01712345678' } });

  it('requires a transaction id and the sender number', async () => {
    const res = await visitor().post('/api/orders', checkout({ payment: { method: 'bkash' } }));
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.trxId);
    assert.ok(res.body.fields.sender);
  });

  it('records the payment as awaiting verification', async () => {
    const res = await visitor().post('/api/orders', paid('9XK2L8M3QA'));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.order.payment.status, 'awaiting');
    assert.equal(res.body.order.payment.trxId, '9XK2L8M3QA');
  });

  it('refuses to reuse a transaction id on a second order', async () => {
    const first = await visitor().post('/api/orders', paid('REUSE12345'));
    assert.equal(first.status, 201);
    const second = await visitor().post('/api/orders', paid('reuse12345', 'nagad'));
    assert.equal(second.status, 422);
    assert.ok(second.body.fields.trxId);
  });

  it('refuses a disabled payment method', async () => {
    const res = await visitor().post('/api/orders', checkout({ payment: { method: 'card' } }));
    assert.equal(res.status, 422);
  });
});

describe('admin order management', () => {
  it('moves an order through its statuses and keeps a history', async () => {
    const placed = await visitor().post('/api/orders', checkout());
    const admin = await adminClient();
    for (const status of ['confirmed', 'packed', 'shipped', 'delivered']) {
      const res = await admin.patch(`/api/admin/orders/${placed.body.order.id}`, { status });
      assert.equal(res.status, 200);
      assert.equal(res.body.order.status, status);
    }
    const final = (await admin.get('/api/admin/orders')).body.orders.find((o) => o.id === placed.body.order.id);
    assert.equal(final.payment.status, 'paid', 'a delivered cash-on-delivery order has been paid');
    assert.deepEqual(
      final.history.map((h) => h.status),
      ['placed', 'confirmed', 'packed', 'shipped', 'delivered'],
    );
  });

  it('rejects an unknown status', async () => {
    const placed = await visitor().post('/api/orders', checkout());
    const admin = await adminClient();
    assert.equal(
      (await admin.patch(`/api/admin/orders/${placed.body.order.id}`, { status: 'teleported' })).status,
      422,
    );
  });

  it('validates product edits', async () => {
    const admin = await adminClient();
    const path = `/api/admin/products/${COLA}`;
    assert.equal((await admin.patch(path, { price: -5 })).status, 422);
    assert.equal((await admin.patch(path, { price: 'free' })).status, 422);
    assert.equal((await admin.patch(path, { stock: -1 })).status, 422);
    assert.equal((await admin.patch(path, { dealEndsAt: 'not a date' })).status, 422);
    assert.equal((await admin.patch(path, { compareAt: 10 })).status, 422, 'the old price must exceed the new price');
    assert.equal((await admin.patch(path, { stock: 640 })).status, 200);
  });

  it('shows the dashboard numbers', async () => {
    const admin = await adminClient();
    const stats = await admin.get('/api/admin/stats');
    assert.equal(stats.status, 200);
    assert.ok(stats.body.orders.total > 0);
    assert.equal(typeof stats.body.revenue.total, 'number');
    assert.equal(stats.body.placeholderPayments, true, 'the sample mobile-money numbers are flagged until replaced');
  });
});

describe('contact and newsletter', () => {
  it('stores a contact message for the administrator', async () => {
    const sent = await visitor().post('/api/contact', {
      name: 'Nusrat',
      email: 'nusrat@example.com',
      message: 'Do you deliver to Savar?',
    });
    assert.equal(sent.status, 201);
    const admin = await adminClient();
    const inbox = (await admin.get('/api/admin/messages')).body.messages;
    assert.ok(inbox.some((m) => m.email === 'nusrat@example.com' && m.read === false));
  });

  it('validates contact details', async () => {
    const res = await visitor().post('/api/contact', { name: '', email: 'nope', message: '' });
    assert.equal(res.status, 422);
    assert.deepEqual(Object.keys(res.body.fields).sort(), ['email', 'message', 'name']);
  });

  it('subscribes an address once and returns the welcome code', async () => {
    const client = visitor();
    const first = await client.post('/api/newsletter', { email: 'Reader@Example.com' });
    assert.equal(first.status, 201);
    assert.equal(first.body.coupon, 'WELCOME50');
    await client.post('/api/newsletter', { email: 'reader@example.com' });
    const admin = await adminClient();
    const list = (await admin.get('/api/admin/subscribers')).body.subscribers;
    assert.equal(list.filter((s) => s.email === 'reader@example.com').length, 1);
  });
});
