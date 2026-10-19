// JSON API. Every handler receives a context object:
//
//   { req, res, url, params, ip, user, admin, body }
//
// `user` is the logged-in customer (or null), `admin` is true for a valid admin session and `body` is the parsed JSON
// body of non-GET requests. Handlers answer with json() or throw an HttpError; the dispatcher at the bottom of this file
// turns errors into responses.
import crypto from 'node:crypto';
import { site, products, collections, posts, faq, pages, orders, users, reviews, subscribers, messages } from './db.js';
import {
  HttpError,
  json,
  readJson,
  parseCookies,
  setCookie,
  cookieName,
  clean,
  normalizePhone,
  isEmail,
  rateLimit,
  retryAfter,
  rateKey,
  FailureTracker,
  randomId,
} from './util.js';
import {
  sign,
  verify,
  hashPassword,
  verifyPassword,
  dummyHash,
  verifyAdminPassword,
  adminVersion,
  MAX_PASSWORD_LENGTH,
} from './auth.js';
import { allCards, toDetail, findProduct, collectionList, ratingFor } from './catalog.js';
import { Payload, sendPayload } from './encode.js';
import { versionJson } from './assets.js';
import { quote, placeOrder, publicOrder, findOrderForCustomer, setStatus, STATUSES, STATUS_LABEL } from './orders.js';

const SESSION_COOKIE = cookieName('di_session');
const ADMIN_COOKIE = cookieName('di_admin');
const THIRTY_DAYS = 30 * 24 * 3600;
const ADMIN_SESSION_SECONDS = 12 * 3600;
const JSON_TYPE = 'application/json; charset=utf-8';

// ---------------------------------------------------------------- routing table

const routes = [];

/** Register a route. `:name` segments in the pattern become entries of ctx.params. */
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/:([a-zA-Z]+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '/?$',
  );
  routes.push({ method, re, keys, handler });
};

// ---------------------------------------------------------------- helpers

/** The parts of a customer record that are safe to send back to that customer. */
const publicUser = (u) =>
  u && { id: u.id, name: u.name, phone: u.phone, email: u.email, addresses: u.addresses || [], createdAt: u.createdAt };

// Cookies carry a signed token with a type, so a customer token can never be mistaken for an admin one.
const currentUser = (req) => {
  const t = verify(parseCookies(req)[SESSION_COOKIE]);
  return t?.typ === 'session' && t.uid ? users.find((u) => u.id === t.uid) || null : null;
};
const isAdmin = (req) => {
  const t = verify(parseCookies(req)[ADMIN_COOKIE]);
  return t?.typ === 'admin' && t.v === adminVersion();
};

// Dates are shown in Bangladesh time (UTC+6, no daylight saving).
const bdNow = () => new Date(Date.now() + 6 * 3600_000);
const bdDay = (iso) => new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 10);

/** Per-visitor rate limit. Throws 429 with a Retry-After header when `key` has been used more than `max` times. */
function limit(ctx, key, max, windowMs, msg = 'Too many requests. Please try again in a little while.') {
  const k = `${key}:${rateKey(ctx.ip)}`;
  if (!rateLimit(k, max, windowMs)) throw new HttpError(429, msg, {}, { 'Retry-After': retryAfter(k, windowMs) });
}

const needUser = (ctx) => {
  if (!ctx.user) throw new HttpError(401, 'Please log in first.');
};
const needAdmin = (ctx) => {
  if (!ctx.admin) throw new HttpError(401, 'Admin login required.');
};

// Wrong-password attempts. Per account (to stop distributed guessing) and per account + visitor (so a stranger cannot
// lock a customer out of their own account by guessing from a single address).
const accountFailures = new FailureTracker(12, 15 * 60_000);
const visitorFailures = new FailureTracker(5, 15 * 60_000);
const adminFailures = new FailureTracker(6, 15 * 60_000);

/** Throw 429 if a failure tracker has blocked `key`. */
function assertNotBlocked(tracker, key, msg) {
  if (tracker.blocked(key)) throw new HttpError(429, msg, {}, { 'Retry-After': tracker.retryAfter(key) });
}

/** Neutralise spreadsheet formulas: a text cell that starts with = + - @ would otherwise run when the CSV is opened. */
function csvCell(v) {
  if (typeof v === 'number') return String(v);
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------- public catalogue

// When the data folder is throw-away storage (see server/vercel-env.js) say so on every page, so nobody
// mistakes a preview deployment for a shop that really takes orders.
const PREVIEW_NOTICE = 'Preview site — orders placed here are not saved or delivered.';
const publicSite = () => {
  const s = site.get();
  return process.env.DRINKIT_EPHEMERAL === '1'
    ? { ...s, announcements: [PREVIEW_NOTICE, ...(s.announcements || [])] }
    : s;
};

// The catalogue is identical for every visitor, so it is built once, compressed once and shared with browsers and
// CDNs. It is rebuilt when its data changes, and at least once a minute so expired deals drop out.
// Browsers keep it for 30 s and then revalidate (a cheap 304); shared caches keep it for a minute. Vercel's CDN may also
// serve a slightly older copy while it fetches a fresh one, which keeps cold starts out of the visitor's way.
const CATALOGUE_CACHE = {
  'Cache-Control': 'public, max-age=30, s-maxage=60',
  'Vercel-CDN-Cache-Control': 'max-age=60, stale-while-revalidate=600',
};
let catalogue = { key: '', payload: null };

function cataloguePayload() {
  const key = `${[site, products, collections, posts, reviews].map((t) => t.stamp()).join('|')}|${Math.floor(Date.now() / 60_000)}`;
  if (catalogue.key !== key) {
    const data = {
      site: publicSite(),
      collections: collectionList(),
      products: allCards(),
      posts: posts.get().map(({ body: _body, ...p }) => p), // article text is fetched when an article is opened
    };
    catalogue = { key, payload: new Payload(JSON.stringify(versionJson(data)), JSON_TYPE) };
  }
  return catalogue.payload;
}

// Everything the storefront needs to render: site settings, collections, product cards and article summaries.
route('GET', '/api/catalogue', (ctx) => {
  sendPayload(ctx.req, ctx.res, cataloguePayload(), { ...CATALOGUE_CACHE, 'X-Content-Type-Options': 'nosniff' });
});

// One product with its long description and tasting notes (the product page).
route('GET', '/api/products/:handle', (ctx) => {
  const p = findProduct(ctx.params.handle);
  if (!p) throw new HttpError(404, 'Product not found');
  json(ctx.res, 200, toDetail(p));
});

// Approved reviews, newest first; `?product=<handle>` limits them to one product and adds its rating statistics.
route('GET', '/api/reviews', (ctx) => {
  const handle = clean(ctx.url.searchParams.get('product'), 120);
  const list = reviews
    .filter((r) => r.approved && (!handle || r.product === handle))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 60)
    .map(({ id, product, name, rating, title, body, createdAt, verified }) => ({
      id,
      product,
      name,
      rating,
      title,
      body,
      createdAt,
      verified,
    }));
  json(ctx.res, 200, { reviews: list, stats: handle ? ratingFor(handle) : undefined });
});

// A visitor's review. It is stored unapproved and shown only after an administrator approves it.
route('POST', '/api/reviews', async (ctx) => {
  limit(ctx, 'review', 8, 3_600_000);
  const b = ctx.body;
  const handle = clean(b.product, 120);
  if (!findProduct(handle)) throw new HttpError(404, 'Product not found');
  const rating = Math.floor(Number(b.rating));
  const name = clean(b.name, 60);
  const body = clean(b.body, 1000);
  const errors = {};
  if (!(rating >= 1 && rating <= 5)) errors.rating = 'Choose a star rating.';
  if (name.length < 2) errors.name = 'Please enter your name.';
  if (body.length < 5) errors.body = 'Please write a short review.';
  if (Object.keys(errors).length) throw new HttpError(422, 'Please fix the highlighted fields.', { fields: errors });
  // new reviews wait for approval in the admin dashboard before they appear on the site
  reviews.add({
    id: randomId(6),
    product: handle,
    name,
    rating,
    title: clean(b.title, 80),
    body,
    createdAt: new Date().toISOString(),
    approved: false,
    verified: false,
  });
  json(ctx.res, 201, { ok: true, message: 'Thank you! Your review will appear once it has been approved.' });
});

// ---------------------------------------------------------------- editorial content

// One article with its full text, plus three others to read next.
route('GET', '/api/posts/:handle', (ctx) => {
  const p = posts.get().find((x) => x.handle === ctx.params.handle);
  if (!p) throw new HttpError(404, 'Article not found');
  json(ctx.res, 200, {
    post: p,
    related: posts
      .get()
      .filter((x) => x.handle !== p.handle)
      .slice(0, 3)
      .map(({ body: _body, ...r }) => r),
  });
});
// The frequently asked questions.
route('GET', '/api/faq', (ctx) => json(ctx.res, 200, { faq: faq.get() }));
// A policy page (shipping, refunds, privacy, terms).
route('GET', '/api/pages/:handle', (ctx) => {
  const all = pages.get();
  // hasOwn: "constructor" and "__proto__" are not pages, even though plain objects "have" them
  if (!Object.hasOwn(all, ctx.params.handle)) throw new HttpError(404, 'Page not found');
  json(ctx.res, 200, { page: all[ctx.params.handle] });
});

// ---------------------------------------------------------------- cart and orders

// Price a basket without placing an order. An unusable coupon is reported next to the quote instead of failing it.
route('POST', '/api/quote', (ctx) => {
  limit(ctx, 'quote', 120, 60_000);
  const input = {
    shipping: ctx.body.shipping || {},
    coupon: ctx.body.coupon,
    phone: normalizePhone(ctx.body.customer?.phone), // lets single-use coupons be checked before the order is placed
  };
  let q;
  try {
    q = quote(ctx.body.items, input);
  } catch (e) {
    // an invalid coupon should not block the basket preview
    if (e instanceof HttpError && e.extra?.fields?.coupon) {
      q = quote(ctx.body.items, { ...input, coupon: '' });
      q.couponError = e.message;
    } else throw e;
  }
  json(ctx.res, 200, { quote: q });
});

// Place an order. Pricing, stock and the coupon are decided by orders.placeOrder(), never by the request.
route('POST', '/api/orders', (ctx) => {
  limit(
    ctx,
    'order',
    20,
    3_600_000,
    'You have placed several orders recently. Please wait a little before ordering again.',
  );
  // also cap per phone number: a few real orders an hour is plenty, and it blunts fake cash-on-delivery spam
  const phone = normalizePhone(ctx.body.customer?.phone);
  if (phone && !rateLimit(`order-phone:${phone}`, 6, 3_600_000)) {
    throw new HttpError(429, 'Several orders were placed with this number recently. Please try again later.');
  }
  const order = placeOrder(ctx.body, ctx.user);
  json(ctx.res, 201, { order: publicOrder(order) });
});

// Guests track an order with its number *and* the phone it was placed with; neither alone is enough. A signed-in
// customer opening an order placed from their own account does not need to repeat the phone number.
route('GET', '/api/orders/lookup', (ctx) => {
  limit(ctx, 'lookup', 30, 600_000);
  const number = ctx.url.searchParams.get('number');
  const wanted = clean(number, 40).toUpperCase();
  const own = ctx.user && orders.find((o) => o.userId === ctx.user.id && o.number === wanted);
  const order = own || findOrderForCustomer(number, ctx.url.searchParams.get('phone'));
  json(ctx.res, 200, { order: publicOrder(order) });
});

// Powers the "someone just ordered" pop-ups. Deliberately coarse: product, district and a relative time only.
route('GET', '/api/activity', (ctx) => {
  const since = Date.now() - 48 * 3600_000;
  const recent = orders
    .filter((o) => o.status !== 'cancelled' && new Date(o.createdAt).getTime() > since)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8)
    .map((o) => {
      const l = o.items[0];
      return {
        title: l.title,
        image: l.image,
        tile: l.tile,
        place: o.shipping.district,
        minutesAgo: Math.max(1, Math.round((Date.now() - new Date(o.createdAt).getTime()) / 60000)),
        handle: l.handle,
      };
    });
  json(ctx.res, 200, { activity: recent });
});

// Newsletter sign-up; replies with the welcome coupon code.
route('POST', '/api/newsletter', (ctx) => {
  limit(ctx, 'news', 10, 3_600_000);
  const email = clean(ctx.body.email, 120).toLowerCase();
  if (!isEmail(email))
    throw new HttpError(422, 'Please enter a valid email address.', { fields: { email: 'Invalid email' } });
  if (!subscribers.find((s) => s.email === email)) subscribers.add({ email, createdAt: new Date().toISOString() });
  json(ctx.res, 201, {
    ok: true,
    coupon: 'WELCOME50',
    message: 'You are in! Use code WELCOME50 for ৳50 off your first order over ৳400.',
  });
});

// Contact form: stored for the administrator to read in the dashboard.
route('POST', '/api/contact', (ctx) => {
  limit(ctx, 'contact', 8, 3_600_000);
  const b = ctx.body;
  const email = clean(b.email, 120).toLowerCase();
  const errors = {};
  const name = clean(b.name, 80);
  const message = clean(b.message, 2000);
  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!isEmail(email)) errors.email = 'Please enter a valid email.';
  if (message.length < 5) errors.message = 'Please write a message.';
  if (Object.keys(errors).length) throw new HttpError(422, 'Please fix the highlighted fields.', { fields: errors });
  messages.add({
    id: randomId(6),
    name,
    email,
    phone: clean(b.phone, 20),
    message,
    createdAt: new Date().toISOString(),
    read: false,
  });
  json(ctx.res, 201, { ok: true, message: 'Thanks! Your message has been sent — we will get back to you soon.' });
});

// ---------------------------------------------------------------- customer accounts

function startSession(res, user) {
  setCookie(res, SESSION_COOKIE, sign({ typ: 'session', uid: user.id }, THIRTY_DAYS), { maxAge: THIRTY_DAYS });
}

// Create a customer account and sign in. Phone numbers are not verified, so an account never grants access to orders it did not place.
route('POST', '/api/auth/register', async (ctx) => {
  limit(ctx, 'register', 10, 3_600_000);
  const b = ctx.body;
  const errors = {};
  const name = clean(b.name, 80);
  const phone = normalizePhone(b.phone);
  const email = clean(b.email, 120).toLowerCase();
  const password = String(b.password || '');
  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!phone) errors.phone = 'Enter a valid Bangladeshi mobile number.';
  if (email && !isEmail(email)) errors.email = 'Enter a valid email or leave it blank.';
  if (password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (password.length > MAX_PASSWORD_LENGTH) errors.password = `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (phone && users.find((u) => u.phone === phone)) errors.phone = 'An account with this phone number already exists.';
  if (email && users.find((u) => u.email === email)) errors.email = 'An account with this email already exists.';
  if (Object.keys(errors).length) throw new HttpError(422, 'Please fix the highlighted fields.', { fields: errors });
  const user = users.add({
    id: crypto.randomUUID(),
    name,
    phone,
    email,
    passwordHash: await hashPassword(password),
    addresses: [],
    createdAt: new Date().toISOString(),
  });
  startSession(ctx.res, user);
  json(ctx.res, 201, { user: publicUser(user) });
});

// Sign in with a phone number or email. Wrong guesses are limited per account and per visitor (see FailureTracker above).
route('POST', '/api/auth/login', async (ctx) => {
  limit(ctx, 'login', 30, 600_000, 'Too many login attempts. Please wait a few minutes.');
  const id = clean(ctx.body.id, 120).toLowerCase();
  const phone = normalizePhone(id);
  const accountKey = `acct:${phone || id}`;
  const visitorKey = `${rateKey(ctx.ip)}|${accountKey}`;
  const blocked = 'Too many failed attempts. Please wait a few minutes and try again.';
  assertNotBlocked(accountFailures, accountKey, blocked);
  assertNotBlocked(visitorFailures, visitorKey, blocked);

  const user = users.find((u) => (phone && u.phone === phone) || (id.includes('@') && u.email === id));
  const password = String(ctx.body.password || '').slice(0, MAX_PASSWORD_LENGTH);
  // Always do the same amount of hashing work, so response time does not reveal whether the account exists.
  const result = await verifyPassword(password, user?.passwordHash || (await dummyHash()));
  if (!user || !result.ok) {
    accountFailures.record(accountKey);
    visitorFailures.record(visitorKey);
    throw new HttpError(401, 'Wrong phone/email or password.');
  }
  visitorFailures.clear(visitorKey);
  if (result.rehash) {
    // upgrade hashes made with weaker parameters now that we have the plain password
    user.passwordHash = await hashPassword(password);
    users.save();
  }
  startSession(ctx.res, user);
  json(ctx.res, 200, { user: publicUser(user) });
});

// Forget the session cookie.
route('POST', '/api/auth/logout', (ctx) => {
  setCookie(ctx.res, SESSION_COOKIE, '', { maxAge: 0 });
  json(ctx.res, 200, { ok: true });
});

// The signed-in customer, or null. Per visitor, so never cached (the catalogue is fetched separately).
route('GET', '/api/me', (ctx) => json(ctx.res, 200, { user: publicUser(ctx.user) }));

// Update name, email and saved addresses.
route('PATCH', '/api/me', (ctx) => {
  needUser(ctx);
  const b = ctx.body;
  const errors = {};
  const changes = {}; // applied only if every field is valid, so a rejected request never half-updates the account
  if (b.name !== undefined) {
    const n = clean(b.name, 80);
    if (n.length < 2) errors.name = 'Please enter your name.';
    else changes.name = n;
  }
  if (b.email !== undefined) {
    const e = clean(b.email, 120).toLowerCase();
    if (e && !isEmail(e)) errors.email = 'Enter a valid email.';
    else if (e && users.find((u) => u.email === e && u.id !== ctx.user.id))
      errors.email = 'That email is already used.';
    else changes.email = e;
  }
  if (Array.isArray(b.addresses)) {
    changes.addresses = b.addresses.slice(0, 5).map((a) => ({
      label: clean(a?.label, 30) || 'Home',
      division: clean(a?.division, 40),
      district: clean(a?.district, 40),
      area: clean(a?.area, 80),
      address: clean(a?.address, 300),
    }));
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Please fix the highlighted fields.', { fields: errors });
  Object.assign(ctx.user, changes);
  users.save();
  json(ctx.res, 200, { user: publicUser(ctx.user) });
});

// Only orders placed while logged in. Matching by phone number would let anyone who registers with someone else's
// number read that person's earlier orders (accounts do not verify phone ownership).
route('GET', '/api/me/orders', (ctx) => {
  needUser(ctx);
  const mine = orders
    .filter((o) => o.userId === ctx.user.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(publicOrder);
  json(ctx.res, 200, { orders: mine });
});

// ---------------------------------------------------------------- admin

// Admin sign-in. Failed attempts are limited per address and logged.
route('POST', '/api/admin/login', async (ctx) => {
  limit(ctx, 'admin-login', 20, 600_000, 'Too many attempts. Please wait a few minutes.');
  const key = rateKey(ctx.ip);
  assertNotBlocked(adminFailures, key, 'Too many failed attempts. Please wait a few minutes.');
  if (!(await verifyAdminPassword(ctx.body.password))) {
    adminFailures.record(key);
    console.warn(`[security] failed admin login from ${key}`);
    throw new HttpError(401, 'Wrong password.');
  }
  adminFailures.clear(key);
  setCookie(ctx.res, ADMIN_COOKIE, sign({ typ: 'admin', v: adminVersion() }, ADMIN_SESSION_SECONDS), {
    maxAge: ADMIN_SESSION_SECONDS,
  });
  json(ctx.res, 200, { ok: true });
});
// End the admin session.
route('POST', '/api/admin/logout', (ctx) => {
  setCookie(ctx.res, ADMIN_COOKIE, '', { maxAge: 0 });
  json(ctx.res, 200, { ok: true });
});
// Whether the caller has a valid admin session (the dashboard uses it to choose between login and content).
route('GET', '/api/admin/session', (ctx) => json(ctx.res, 200, { admin: !!ctx.admin }));

// Dashboard numbers: orders and revenue (Bangladesh calendar day), best sellers, low stock and things waiting for attention.
route('GET', '/api/admin/stats', (ctx) => {
  needAdmin(ctx);
  const all = orders.all();
  const today = bdNow().toISOString().slice(0, 10);
  const live = all.filter((o) => o.status !== 'cancelled');
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, all.filter((o) => o.status === s).length]));
  const sold = new Map();
  for (const o of live) {
    for (const l of o.items) sold.set(l.handle, { title: l.title, cans: (sold.get(l.handle)?.cans || 0) + l.cans });
  }
  const sum = (arr) => arr.reduce((s, o) => s + o.pricing.total, 0);
  json(ctx.res, 200, {
    orders: { total: all.length, today: all.filter((o) => bdDay(o.createdAt) === today).length, byStatus },
    revenue: {
      total: sum(live),
      today: sum(live.filter((o) => bdDay(o.createdAt) === today)),
      delivered: sum(all.filter((o) => o.status === 'delivered')),
    },
    avgOrder: live.length ? Math.round(sum(live) / live.length) : 0,
    awaitingPayment: all.filter((o) => o.payment.status === 'awaiting' && o.status !== 'cancelled').length,
    lowStock: products
      .get()
      .filter((p) => p.stock < 25)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8)
      .map((p) => ({ handle: p.handle, title: p.title, stock: p.stock })),
    top: [...sold.entries()]
      .map(([handle, v]) => ({ handle, ...v }))
      .sort((a, b) => b.cans - a.cans)
      .slice(0, 6),
    subscribers: subscribers.all().length,
    unreadMessages: messages.filter((m) => !m.read).length,
    pendingReviews: reviews.filter((r) => !r.approved).length,
    // true while the payment numbers in site.json are still the 01XXX placeholders
    placeholderPayments: Object.values(site.get().payments).some((p) => p.enabled && /X/.test(p.number || '')),
  });
});

// Orders, newest first, optionally filtered by status, awaiting payment check, or a search over number, name, phone and district.
route('GET', '/api/admin/orders', (ctx) => {
  needAdmin(ctx);
  const sp = ctx.url.searchParams;
  const status = sp.get('status');
  const q = clean(sp.get('q'), 60).toLowerCase();
  let list = orders
    .all()
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (status && STATUSES.includes(status)) list = list.filter((o) => o.status === status);
  if (sp.get('payment') === 'awaiting') {
    list = list.filter((o) => o.payment.status === 'awaiting' && o.status !== 'cancelled');
  }
  if (q) {
    list = list.filter((o) =>
      `${o.number} ${o.customer.name} ${o.customer.phone} ${o.shipping.district}`.toLowerCase().includes(q),
    );
  }
  json(ctx.res, 200, { orders: list.slice(0, 300), total: list.length, statuses: STATUS_LABEL });
});

// Change an order's status, payment status or internal note. Cancelling returns the cans to stock.
route('PATCH', '/api/admin/orders/:id', (ctx) => {
  needAdmin(ctx);
  const o = orders.find((x) => x.id === ctx.params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  const b = ctx.body;
  if (b.status) setStatus(o, b.status, b.note);
  if (b.paymentStatus) {
    if (!['cod', 'awaiting', 'paid', 'failed', 'refunded'].includes(b.paymentStatus)) {
      throw new HttpError(422, 'Unknown payment status');
    }
    o.payment.status = b.paymentStatus;
  }
  if (b.adminNote !== undefined) o.adminNote = clean(b.adminNote, 500);
  orders.save();
  json(ctx.res, 200, { order: o });
});

// All orders as a spreadsheet. Every cell goes through csvCell() so text cannot run as a formula.
route('GET', '/api/admin/orders.csv', (ctx) => {
  needAdmin(ctx);
  const head = [
    'Order',
    'Date',
    'Status',
    'Name',
    'Phone',
    'District',
    'Address',
    'Items',
    'Subtotal',
    'Discount',
    'Delivery',
    'Total',
    'Payment',
    'Payment status',
    'TrxID',
  ];
  const rows = orders
    .all()
    .map((o) => [
      o.number,
      o.createdAt,
      o.status,
      o.customer.name,
      o.customer.phone,
      o.shipping.district,
      `${o.shipping.area}, ${o.shipping.address}`,
      o.items.map((l) => `${l.qty}x ${l.title} (${l.packLabel})`).join('; '),
      o.pricing.subtotal,
      o.pricing.discount,
      o.pricing.delivery,
      o.pricing.total,
      o.payment.method,
      o.payment.status,
      o.payment.trxId,
    ]);
  // the BOM makes Excel read the file as UTF-8, so Bengali names survive
  const csv = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  ctx.res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="drinkit-orders.csv"',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  ctx.res.end(csv);
});

// Products with the fields the price and stock editor needs.
route('GET', '/api/admin/products', (ctx) => {
  needAdmin(ctx);
  json(ctx.res, 200, {
    products: products.get().map((p) => ({
      handle: p.handle,
      title: p.title,
      brand: p.brand,
      canMl: p.canMl,
      price: p.price,
      compareAt: p.compareAt,
      stock: p.stock,
      dealEndsAt: p.dealEndsAt,
      image: p.images.thumb,
      tile: p.tile,
      packs: p.packs,
    })),
  });
});

// Edit price, old price, stock and deal end time; pack prices are recalculated from the single-can price.
route('PATCH', '/api/admin/products/:handle', (ctx) => {
  needAdmin(ctx);
  const list = products.get();
  const p = list.find((x) => x.handle === ctx.params.handle);
  if (!p) throw new HttpError(404, 'Product not found');
  const b = ctx.body;
  if (b.price !== undefined) {
    const price = Math.floor(Number(b.price));
    if (!(price >= 1 && price <= 100000)) throw new HttpError(422, 'Price must be between ৳1 and ৳100,000.');
    p.price = price;
  }
  if (b.compareAt !== undefined) {
    const c = Math.floor(Number(b.compareAt)) || 0;
    if (c && c <= p.price) throw new HttpError(422, 'The old price must be higher than the current price.');
    p.compareAt = c;
  }
  if (b.stock !== undefined) {
    const s = Math.floor(Number(b.stock));
    if (!(s >= 0 && s <= 1_000_000)) throw new HttpError(422, 'Stock must be 0 or more.');
    p.stock = s;
  }
  if (b.dealEndsAt !== undefined) {
    const when = b.dealEndsAt ? new Date(b.dealEndsAt) : null;
    if (when && Number.isNaN(when.getTime())) throw new HttpError(422, 'The deal end date is not a valid date.');
    p.dealEndsAt = when ? when.toISOString() : null;
  }
  // keep pack prices in sync with the single-can price
  for (const pk of p.packs) {
    const gross = p.price * pk.qty;
    pk.price = Math.round(gross * (1 - (pk.discount || 0)));
    pk.compareAt = pk.qty > 1 ? gross : p.compareAt || 0;
  }
  products.save(list);
  json(ctx.res, 200, { ok: true });
});

// All reviews, including the ones waiting for approval.
route('GET', '/api/admin/reviews', (ctx) => {
  needAdmin(ctx);
  const list = reviews
    .all()
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 300);
  json(ctx.res, 200, { reviews: list });
});
// Approve or hide a review.
route('PATCH', '/api/admin/reviews/:id', (ctx) => {
  needAdmin(ctx);
  const r = reviews.find((x) => x.id === ctx.params.id);
  if (!r) throw new HttpError(404, 'Review not found');
  r.approved = !!ctx.body.approved;
  reviews.save();
  json(ctx.res, 200, { ok: true });
});
// Delete a review.
route('DELETE', '/api/admin/reviews/:id', (ctx) => {
  needAdmin(ctx);
  reviews.remove((r) => r.id === ctx.params.id);
  json(ctx.res, 200, { ok: true });
});
// Contact-form messages, newest first.
route('GET', '/api/admin/messages', (ctx) => {
  needAdmin(ctx);
  json(ctx.res, 200, {
    messages: messages
      .all()
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  });
});
// Mark a message read or unread.
route('PATCH', '/api/admin/messages/:id', (ctx) => {
  needAdmin(ctx);
  const m = messages.find((x) => x.id === ctx.params.id);
  if (!m) throw new HttpError(404, 'Message not found');
  m.read = !!ctx.body.read;
  messages.save();
  json(ctx.res, 200, { ok: true });
});
// Newsletter subscribers, newest first.
route('GET', '/api/admin/subscribers', (ctx) => {
  needAdmin(ctx);
  json(ctx.res, 200, {
    subscribers: subscribers
      .all()
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  });
});
// Registered customers with their number of orders. Password hashes are never included.
route('GET', '/api/admin/customers', (ctx) => {
  needAdmin(ctx);
  json(ctx.res, 200, {
    customers: users.all().map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      createdAt: u.createdAt,
      orders: orders.filter((o) => o.userId === u.id).length,
    })),
  });
});

// ---------------------------------------------------------------- dispatcher

/**
 * CSRF defence for requests that change state. Browsers label every request with Sec-Fetch-Site; anything that is not
 * same-origin is refused. Older browsers (and non-browser clients) fall back to comparing the Origin header with Host.
 * Cookies are SameSite=Lax and the API only accepts JSON, which a cross-site form cannot send - this is the second layer.
 */
function isTrustedOrigin(req) {
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const origin = req.headers.origin;
  if (!origin) return true; // curl, server-to-server calls and same-origin GET-like navigations send no Origin
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Decode `:param` values, answering 400 (not 500) for malformed percent-escapes. */
function decodeParam(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'Bad request');
  }
}

/**
 * Entry point for every /api request: find the route, enforce method, origin, content type, rate limit and body size,
 * build the context and run the handler. Errors become JSON responses; unexpected ones are logged, never shown.
 */
export async function handleApi(req, res, url, ip) {
  try {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    let matched = null;
    let params = {};
    let pathMatched = false;
    for (const r of routes) {
      const m = url.pathname.match(r.re);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      matched = r;
      params = Object.fromEntries(r.keys.map((k, i) => [k, decodeParam(m[i + 1])]));
      break;
    }
    if (!matched) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Not found');
    if (method !== 'GET') {
      if (!isTrustedOrigin(req)) throw new HttpError(403, 'Cross-origin request blocked');
      const ct = String(req.headers['content-type'] || '');
      if (!ct.includes('application/json')) throw new HttpError(415, 'Send JSON (Content-Type: application/json)');
    }
    const key = `api:${rateKey(ip)}`;
    if (!rateLimit(key, 600, 60_000)) {
      throw new HttpError(429, 'Too many requests', {}, { 'Retry-After': retryAfter(key, 60_000) });
    }
    const ctx = {
      req,
      res,
      url,
      params,
      ip,
      user: currentUser(req),
      admin: isAdmin(req),
      body: method === 'GET' ? {} : await readJson(req),
    };
    await matched.handler(ctx);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('API error:', e);
    if (!res.headersSent) {
      const body = { error: status === 500 ? 'Something went wrong on our side.' : e.message, ...(e.extra || {}) };
      json(res, status, body, e.headers);
    }
  }
}
