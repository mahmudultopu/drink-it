// JSON API. Every handler receives ctx = { req, res, url, params, ip, user, admin, body }.
import crypto from 'node:crypto';
import { site, products, collections as collectionsDb, posts, faq, pages, coupons, orders, users, reviews, subscribers, messages } from './db.js';
import { HttpError, json, readJson, parseCookies, setCookie, clean, normalizePhone, isEmail, rateLimit, randomId } from './util.js';
import { sign, verify, hashPassword, verifyPassword, verifyAdminPassword } from './auth.js';
import { allCards, toCard, toDetail, findProduct, collectionList, invalidateStats, ratingFor } from './catalog.js';
import { quote, placeOrder, publicOrder, findOrderForCustomer, setStatus, STATUSES, STATUS_LABEL } from './orders.js';

const SESSION_COOKIE = 'di_session';
const ADMIN_COOKIE = 'di_admin';
const THIRTY_DAYS = 30 * 24 * 3600;

const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler, ...opts });
};

const publicUser = (u) => u && { id: u.id, name: u.name, phone: u.phone, email: u.email, addresses: u.addresses || [], createdAt: u.createdAt };
const currentUser = (req) => {
  const t = verify(parseCookies(req)[SESSION_COOKIE]);
  return t?.uid ? users.find((u) => u.id === t.uid) || null : null;
};
const isAdmin = (req) => verify(parseCookies(req)[ADMIN_COOKIE])?.role === 'admin';
const bdNow = () => new Date(Date.now() + 6 * 3600_000);
const bdDay = (iso) => new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 10);

function limit(ctx, key, max, windowMs, msg = 'Too many requests. Please try again in a little while.') {
  if (!rateLimit(`${key}:${ctx.ip}`, max, windowMs)) throw new HttpError(429, msg);
}
const needUser = (ctx) => { if (!ctx.user) throw new HttpError(401, 'Please log in first.'); };
const needAdmin = (ctx) => { if (!ctx.admin) throw new HttpError(401, 'Admin login required.'); };

// When the data folder is throw-away storage (see server/vercel-env.js) say so on every page, so nobody
// mistakes a preview deployment for a shop that really takes orders.
const PREVIEW_NOTICE = 'Preview site — orders placed here are not saved or delivered.';
const publicSite = () => {
  const s = site.get();
  return process.env.DRINKIT_EPHEMERAL === '1' ? { ...s, announcements: [PREVIEW_NOTICE, ...(s.announcements || [])] } : s;
};

// ---------------------------------------------------------------- public catalogue
route('GET', '/api/bootstrap', (ctx) => {
  json(ctx.res, 200, {
    site: publicSite(),
    collections: collectionList(),
    products: allCards(),
    posts: posts.get().map(({ body, ...p }) => p),
    user: publicUser(ctx.user),
    serverTime: Date.now(),
  });
});

route('GET', '/api/products/:handle', (ctx) => {
  const p = findProduct(ctx.params.handle);
  if (!p) throw new HttpError(404, 'Product not found');
  json(ctx.res, 200, toDetail(p));
});

route('GET', '/api/reviews', (ctx) => {
  const handle = clean(ctx.url.searchParams.get('product'), 120);
  const list = reviews.filter((r) => r.approved && (!handle || r.product === handle))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 60)
    .map(({ id, product, name, rating, title, body, createdAt, verified }) => ({ id, product, name, rating, title, body, createdAt, verified }));
  json(ctx.res, 200, { reviews: list, stats: handle ? ratingFor(handle) : undefined });
});

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
  reviews.add({ id: randomId(6), product: handle, name, rating, title: clean(b.title, 80), body, createdAt: new Date().toISOString(), approved: false, verified: false });
  json(ctx.res, 201, { ok: true, message: 'Thank you! Your review will appear once it has been approved.' });
});

route('GET', '/api/posts/:handle', (ctx) => {
  const p = posts.get().find((x) => x.handle === ctx.params.handle);
  if (!p) throw new HttpError(404, 'Article not found');
  json(ctx.res, 200, { post: p, related: posts.get().filter((x) => x.handle !== p.handle).slice(0, 3).map(({ body, ...r }) => r) });
});
route('GET', '/api/faq', (ctx) => json(ctx.res, 200, { faq: faq.get() }));
route('GET', '/api/pages/:handle', (ctx) => {
  const p = pages.get()[ctx.params.handle];
  if (!p) throw new HttpError(404, 'Page not found');
  json(ctx.res, 200, { page: p });
});

// ---------------------------------------------------------------- cart, orders
route('POST', '/api/quote', (ctx) => {
  limit(ctx, 'quote', 120, 60_000);
  let q;
  try {
    q = quote(ctx.body.items, { shipping: ctx.body.shipping || {}, coupon: ctx.body.coupon });
  } catch (e) {
    // an invalid coupon should not block the basket preview
    if (e instanceof HttpError && e.extra?.fields?.coupon) {
      q = quote(ctx.body.items, { shipping: ctx.body.shipping || {}, coupon: '' });
      q.couponError = e.message;
    } else throw e;
  }
  json(ctx.res, 200, { quote: q });
});

route('POST', '/api/orders', (ctx) => {
  limit(ctx, 'order', 20, 3_600_000, 'You have placed several orders recently. Please wait a little before ordering again.');
  const order = placeOrder(ctx.body, ctx.user);
  json(ctx.res, 201, { order: publicOrder(order) });
});

route('GET', '/api/orders/lookup', (ctx) => {
  limit(ctx, 'lookup', 30, 600_000);
  const o = findOrderForCustomer(ctx.url.searchParams.get('number'), ctx.url.searchParams.get('phone'));
  json(ctx.res, 200, { order: publicOrder(o) });
});

route('GET', '/api/activity', (ctx) => {
  const since = Date.now() - 48 * 3600_000;
  const recent = orders.filter((o) => o.status !== 'cancelled' && new Date(o.createdAt).getTime() > since)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8)
    .map((o) => {
      const l = o.items[0];
      return { title: l.title, image: l.image, tile: l.tile, place: o.shipping.district, minutesAgo: Math.max(1, Math.round((Date.now() - new Date(o.createdAt).getTime()) / 60000)), handle: l.handle };
    });
  json(ctx.res, 200, { activity: recent });
});

route('POST', '/api/newsletter', (ctx) => {
  limit(ctx, 'news', 10, 3_600_000);
  const email = clean(ctx.body.email, 120).toLowerCase();
  if (!isEmail(email)) throw new HttpError(422, 'Please enter a valid email address.', { fields: { email: 'Invalid email' } });
  if (!subscribers.find((s) => s.email === email)) subscribers.add({ email, createdAt: new Date().toISOString() });
  json(ctx.res, 201, { ok: true, coupon: 'WELCOME50', message: 'You are in! Use code WELCOME50 for ৳50 off your first order over ৳400.' });
});

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
  messages.add({ id: randomId(6), name, email, phone: clean(b.phone, 20), message, createdAt: new Date().toISOString(), read: false });
  json(ctx.res, 201, { ok: true, message: 'Thanks! Your message has been sent — we will get back to you soon.' });
});

// ---------------------------------------------------------------- customer accounts
function startSession(res, user) {
  setCookie(res, SESSION_COOKIE, sign({ uid: user.id }, THIRTY_DAYS), { maxAge: THIRTY_DAYS });
}

route('POST', '/api/auth/register', (ctx) => {
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
  if (phone && users.find((u) => u.phone === phone)) errors.phone = 'An account with this phone number already exists.';
  if (email && users.find((u) => u.email === email)) errors.email = 'An account with this email already exists.';
  if (Object.keys(errors).length) throw new HttpError(422, 'Please fix the highlighted fields.', { fields: errors });
  const user = users.add({ id: crypto.randomUUID(), name, phone, email, passwordHash: hashPassword(password), addresses: [], createdAt: new Date().toISOString() });
  startSession(ctx.res, user);
  json(ctx.res, 201, { user: publicUser(user) });
});

route('POST', '/api/auth/login', (ctx) => {
  limit(ctx, 'login', 10, 600_000, 'Too many login attempts. Please wait a few minutes.');
  const id = clean(ctx.body.id, 120).toLowerCase();
  const phone = normalizePhone(id);
  const user = users.find((u) => (phone && u.phone === phone) || (id.includes('@') && u.email === id));
  // always run a hash to keep timing similar for unknown users
  const ok = verifyPassword(String(ctx.body.password || ''), user?.passwordHash || 'scrypt$AAAA$AAAA');
  if (!user || !ok) throw new HttpError(401, 'Wrong phone/email or password.');
  startSession(ctx.res, user);
  json(ctx.res, 200, { user: publicUser(user) });
});

route('POST', '/api/auth/logout', (ctx) => {
  setCookie(ctx.res, SESSION_COOKIE, '', { maxAge: 0 });
  json(ctx.res, 200, { ok: true });
});

route('GET', '/api/me', (ctx) => json(ctx.res, 200, { user: publicUser(ctx.user) }));

route('PATCH', '/api/me', (ctx) => {
  needUser(ctx);
  const b = ctx.body;
  const errors = {};
  if (b.name !== undefined) { const n = clean(b.name, 80); if (n.length < 2) errors.name = 'Please enter your name.'; else ctx.user.name = n; }
  if (b.email !== undefined) {
    const e = clean(b.email, 120).toLowerCase();
    if (e && !isEmail(e)) errors.email = 'Enter a valid email.';
    else if (e && users.find((u) => u.email === e && u.id !== ctx.user.id)) errors.email = 'That email is already used.';
    else ctx.user.email = e;
  }
  if (Array.isArray(b.addresses)) {
    ctx.user.addresses = b.addresses.slice(0, 5).map((a) => ({
      label: clean(a.label, 30) || 'Home', division: clean(a.division, 40), district: clean(a.district, 40), area: clean(a.area, 80), address: clean(a.address, 300),
    }));
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Please fix the highlighted fields.', { fields: errors });
  users.save();
  json(ctx.res, 200, { user: publicUser(ctx.user) });
});

route('GET', '/api/me/orders', (ctx) => {
  needUser(ctx);
  const mine = orders.filter((o) => o.userId === ctx.user.id || o.customer.phone === ctx.user.phone)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(publicOrder);
  json(ctx.res, 200, { orders: mine });
});

// ---------------------------------------------------------------- admin
route('POST', '/api/admin/login', (ctx) => {
  limit(ctx, 'admin-login', 8, 600_000, 'Too many attempts. Please wait a few minutes.');
  if (!verifyAdminPassword(ctx.body.password)) throw new HttpError(401, 'Wrong password.');
  setCookie(ctx.res, ADMIN_COOKIE, sign({ role: 'admin' }, 12 * 3600), { maxAge: 12 * 3600 });
  json(ctx.res, 200, { ok: true });
});
route('POST', '/api/admin/logout', (ctx) => { setCookie(ctx.res, ADMIN_COOKIE, '', { maxAge: 0 }); json(ctx.res, 200, { ok: true }); });
route('GET', '/api/admin/session', (ctx) => json(ctx.res, 200, { admin: !!ctx.admin }));

route('GET', '/api/admin/stats', (ctx) => {
  needAdmin(ctx);
  const all = orders.all();
  const today = bdNow().toISOString().slice(0, 10);
  const live = all.filter((o) => o.status !== 'cancelled');
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, all.filter((o) => o.status === s).length]));
  const sold = new Map();
  for (const o of live) for (const l of o.items) sold.set(l.handle, { title: l.title, cans: (sold.get(l.handle)?.cans || 0) + l.cans });
  const sum = (arr) => arr.reduce((s, o) => s + o.pricing.total, 0);
  json(ctx.res, 200, {
    orders: { total: all.length, today: all.filter((o) => bdDay(o.createdAt) === today).length, byStatus },
    revenue: { total: sum(live), today: sum(live.filter((o) => bdDay(o.createdAt) === today)), delivered: sum(all.filter((o) => o.status === 'delivered')) },
    avgOrder: live.length ? Math.round(sum(live) / live.length) : 0,
    awaitingPayment: all.filter((o) => o.payment.status === 'awaiting' && o.status !== 'cancelled').length,
    lowStock: products.get().filter((p) => p.stock < 25).sort((a, b) => a.stock - b.stock).slice(0, 8).map((p) => ({ handle: p.handle, title: p.title, stock: p.stock })),
    top: [...sold.entries()].map(([handle, v]) => ({ handle, ...v })).sort((a, b) => b.cans - a.cans).slice(0, 6),
    subscribers: subscribers.all().length,
    unreadMessages: messages.filter((m) => !m.read).length,
    pendingReviews: reviews.filter((r) => !r.approved).length,
    placeholderPayments: Object.values(site.get().payments).some((p) => p.enabled && /X/.test(p.number || '')),
  });
});

route('GET', '/api/admin/orders', (ctx) => {
  needAdmin(ctx);
  const sp = ctx.url.searchParams;
  const status = sp.get('status');
  const q = clean(sp.get('q'), 60).toLowerCase();
  let list = orders.all().slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (status && STATUSES.includes(status)) list = list.filter((o) => o.status === status);
  if (sp.get('payment') === 'awaiting') list = list.filter((o) => o.payment.status === 'awaiting' && o.status !== 'cancelled');
  if (q) list = list.filter((o) => `${o.number} ${o.customer.name} ${o.customer.phone} ${o.shipping.district}`.toLowerCase().includes(q));
  json(ctx.res, 200, { orders: list.slice(0, 300), total: list.length, statuses: STATUS_LABEL });
});

route('PATCH', '/api/admin/orders/:id', (ctx) => {
  needAdmin(ctx);
  const o = orders.find((x) => x.id === ctx.params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  const b = ctx.body;
  if (b.status) setStatus(o, b.status, b.note);
  if (b.paymentStatus) {
    if (!['cod', 'awaiting', 'paid', 'failed', 'refunded'].includes(b.paymentStatus)) throw new HttpError(422, 'Unknown payment status');
    o.payment.status = b.paymentStatus;
  }
  if (b.adminNote !== undefined) o.adminNote = clean(b.adminNote, 500);
  orders.save();
  json(ctx.res, 200, { order: o });
});

route('GET', '/api/admin/orders.csv', (ctx) => {
  needAdmin(ctx);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Order', 'Date', 'Status', 'Name', 'Phone', 'District', 'Address', 'Items', 'Subtotal', 'Discount', 'Delivery', 'Total', 'Payment', 'Payment status', 'TrxID'];
  const rows = orders.all().map((o) => [o.number, o.createdAt, o.status, o.customer.name, o.customer.phone, o.shipping.district, `${o.shipping.area}, ${o.shipping.address}`, o.items.map((l) => `${l.qty}x ${l.title} (${l.packLabel})`).join('; '), o.pricing.subtotal, o.pricing.discount, o.pricing.delivery, o.pricing.total, o.payment.method, o.payment.status, o.payment.trxId]);
  const csv = '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  ctx.res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="drinkit-orders.csv"', 'Cache-Control': 'no-store' });
  ctx.res.end(csv);
});

route('GET', '/api/admin/products', (ctx) => {
  needAdmin(ctx);
  json(ctx.res, 200, { products: products.get().map((p) => ({ handle: p.handle, title: p.title, brand: p.brand, canMl: p.canMl, price: p.price, compareAt: p.compareAt, stock: p.stock, dealEndsAt: p.dealEndsAt, image: p.images.single, tile: p.tile, packs: p.packs })) });
});

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
  if (b.dealEndsAt !== undefined) p.dealEndsAt = b.dealEndsAt ? new Date(b.dealEndsAt).toISOString() : null;
  // keep pack prices in sync with the single-can price
  for (const pk of p.packs) {
    const gross = p.price * pk.qty;
    pk.price = Math.round(gross * (1 - (pk.discount || 0)));
    pk.compareAt = pk.qty > 1 ? gross : p.compareAt || 0;
  }
  products.save(list);
  json(ctx.res, 200, { ok: true });
});

route('GET', '/api/admin/reviews', (ctx) => {
  needAdmin(ctx);
  const list = reviews.all().slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 300);
  json(ctx.res, 200, { reviews: list });
});
route('PATCH', '/api/admin/reviews/:id', (ctx) => {
  needAdmin(ctx);
  const r = reviews.find((x) => x.id === ctx.params.id);
  if (!r) throw new HttpError(404, 'Review not found');
  r.approved = !!ctx.body.approved;
  reviews.save();
  invalidateStats();
  json(ctx.res, 200, { ok: true });
});
route('DELETE', '/api/admin/reviews/:id', (ctx) => {
  needAdmin(ctx);
  reviews.remove((r) => r.id === ctx.params.id);
  invalidateStats();
  json(ctx.res, 200, { ok: true });
});
route('GET', '/api/admin/messages', (ctx) => {
  needAdmin(ctx);
  json(ctx.res, 200, { messages: messages.all().slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
});
route('PATCH', '/api/admin/messages/:id', (ctx) => {
  needAdmin(ctx);
  const m = messages.find((x) => x.id === ctx.params.id);
  if (!m) throw new HttpError(404, 'Message not found');
  m.read = !!ctx.body.read;
  messages.save();
  json(ctx.res, 200, { ok: true });
});
route('GET', '/api/admin/subscribers', (ctx) => {
  needAdmin(ctx);
  json(ctx.res, 200, { subscribers: subscribers.all().slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
});
route('GET', '/api/admin/customers', (ctx) => {
  needAdmin(ctx);
  json(ctx.res, 200, { customers: users.all().map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, createdAt: u.createdAt, orders: orders.filter((o) => o.userId === u.id).length })) });
});

// ---------------------------------------------------------------- dispatcher
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

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
      params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      break;
    }
    if (!matched) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Not found');
    if (method !== 'GET') {
      if (!sameOrigin(req)) throw new HttpError(403, 'Cross-origin request blocked');
      const ct = String(req.headers['content-type'] || '');
      if (!ct.includes('application/json')) throw new HttpError(415, 'Send JSON (Content-Type: application/json)');
    }
    if (!rateLimit(`api:${ip}`, 600, 60_000)) throw new HttpError(429, 'Too many requests');
    const ctx = { req, res, url, params, ip, user: currentUser(req), admin: isAdmin(req), body: method === 'GET' ? {} : await readJson(req) };
    await matched.handler(ctx);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('API error:', e);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'Something went wrong on our side.' : e.message, ...(e.extra || {}) });
  }
}
