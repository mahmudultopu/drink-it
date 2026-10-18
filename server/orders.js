// Order pricing (always recomputed on the server), validation, creation, tracking and status changes.
import crypto from 'node:crypto';
import { products, site, coupons, orders } from './db.js';
import { HttpError, clean, normalizePhone, isEmail } from './util.js';

export const STATUSES = ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
export const STATUS_LABEL = {
  placed: 'Order placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function orderNumber() {
  const d = new Date(Date.now() + 6 * 3600_000); // Bangladesh time
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  let rand = '';
  for (const b of crypto.randomBytes(4)) rand += ALPHABET[b % ALPHABET.length];
  return `DI-${ymd}-${rand}`;
}

function deliveryFee(shipping, subtotal) {
  const d = site.get().delivery;
  const zone = d.dhakaZone || ['Dhaka', 'Gazipur', 'Narayanganj'];
  const base = shipping.division === 'Dhaka' && zone.includes(shipping.district) ? d.dhaka : d.outside;
  return subtotal >= d.freeOver ? 0 : base;
}

/** Validate coupon for a given subtotal. Returns { coupon, discount, freeShipping } or throws 422. */
export function applyCoupon(codeRaw, subtotal) {
  const code = clean(codeRaw, 30).toUpperCase();
  if (!code) return { coupon: null, discount: 0, freeShipping: false };
  const c = coupons.get().find((x) => x.code === code && x.active);
  if (!c) throw new HttpError(422, 'That coupon code is not valid.', { fields: { coupon: 'Invalid coupon code' } });
  if (subtotal < c.minSubtotal) {
    throw new HttpError(422, `This coupon needs a minimum order of ৳${c.minSubtotal}.`, { fields: { coupon: `Minimum order ৳${c.minSubtotal}` } });
  }
  if (c.type === 'shipping') return { coupon: { code: c.code, label: c.label }, discount: 0, freeShipping: true };
  let discount = c.type === 'percent' ? Math.floor((subtotal * c.value) / 100) : c.value;
  if (c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
  discount = Math.min(discount, subtotal);
  return { coupon: { code: c.code, label: c.label }, discount, freeShipping: false };
}

/** Price a basket against the live catalogue. */
export function quote(rawItems, { shipping = {}, coupon = '' } = {}) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new HttpError(422, 'Your cart is empty.');
  if (rawItems.length > 60) throw new HttpError(422, 'Too many items in one order.');
  const catalogue = products.get();
  const merged = new Map();
  for (const it of rawItems) {
    const handle = clean(it?.handle, 120);
    const pack = clean(it?.pack, 20) || 'single';
    const qty = Math.floor(Number(it?.qty));
    if (!handle || !Number.isFinite(qty) || qty < 1 || qty > 99) throw new HttpError(422, 'One of the cart items is invalid.');
    const key = `${handle}|${pack}`;
    merged.set(key, { handle, pack, qty: (merged.get(key)?.qty || 0) + qty });
  }
  const lines = [];
  const needed = new Map(); // cans per product
  for (const { handle, pack, qty } of merged.values()) {
    const p = catalogue.find((x) => x.handle === handle);
    if (!p) throw new HttpError(422, 'A product in your cart is no longer available.');
    const pk = p.packs.find((x) => x.id === pack);
    if (!pk) throw new HttpError(422, `Pack option "${pack}" is not available for ${p.title}.`);
    const cans = pk.qty * qty;
    needed.set(p.handle, (needed.get(p.handle) || 0) + cans);
    lines.push({ handle: p.handle, title: p.title, brand: p.brand, pack: pk.id, packLabel: pk.label, packQty: pk.qty, qty, cans, unitPrice: pk.price, lineTotal: pk.price * qty, image: p.images.thumb, packImage: pk.id === 'single' ? p.images.thumb : p.images[pk.id] || p.images.thumb, tile: p.tile });
  }
  for (const [handle, cans] of needed) {
    const p = catalogue.find((x) => x.handle === handle);
    if (p.stock < cans) {
      throw new HttpError(409, p.stock > 0 ? `Only ${p.stock} cans of ${p.title} are left in stock.` : `${p.title} is sold out.`, { handle, stock: p.stock });
    }
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const c = applyCoupon(coupon, subtotal);
  let delivery = deliveryFee(shipping, subtotal);
  if (c.freeShipping) delivery = 0;
  const total = subtotal - c.discount + delivery;
  return { lines, subtotal, discount: c.discount, delivery, total, coupon: c.coupon, cans: lines.reduce((s, l) => s + l.cans, 0) };
}

function validateCustomer(body, user) {
  const errors = {};
  const customer = {
    name: clean(body.customer?.name, 80),
    phone: normalizePhone(body.customer?.phone),
    email: clean(body.customer?.email, 120).toLowerCase(),
  };
  if (customer.name.length < 2) errors.name = 'Please enter your full name.';
  if (!customer.phone) errors.phone = 'Enter a valid Bangladeshi mobile number (e.g. 017XXXXXXXX).';
  if (customer.email && !isEmail(customer.email)) errors.email = 'Enter a valid email address or leave it blank.';

  const divisions = site.get().divisions;
  const shipping = {
    division: clean(body.shipping?.division, 40),
    district: clean(body.shipping?.district, 40),
    area: clean(body.shipping?.area, 80),
    address: clean(body.shipping?.address, 300),
    notes: clean(body.shipping?.notes, 300),
  };
  if (!divisions[shipping.division]) errors.division = 'Choose your division.';
  else if (!divisions[shipping.division].includes(shipping.district)) errors.district = 'Choose your district.';
  if (shipping.area.length < 2) errors.area = 'Enter your area / thana.';
  if (shipping.address.length < 5) errors.address = 'Enter your full delivery address.';

  const payments = site.get().payments;
  const method = clean(body.payment?.method, 20);
  const conf = payments[method];
  const payment = { method, status: 'cod', trxId: '', sender: '' };
  if (!conf || !conf.enabled) errors.method = 'Choose an available payment method.';
  else if (method !== 'cod') {
    payment.trxId = clean(body.payment?.trxId, 24).toUpperCase();
    payment.sender = normalizePhone(body.payment?.sender) || '';
    if (!/^[A-Z0-9]{6,24}$/.test(payment.trxId)) errors.trxId = 'Enter the transaction ID from your payment message.';
    if (!payment.sender) errors.sender = 'Enter the mobile number you paid from.';
    payment.status = 'awaiting';
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Please fix the highlighted fields.', { fields: errors });
  return { customer, shipping, payment, userId: user?.id || null };
}

export function placeOrder(body, user) {
  const v = validateCustomer(body, user);
  const q = quote(body.items, { shipping: v.shipping, coupon: body.coupon });
  const catalogue = products.get();
  // reserve stock
  for (const l of q.lines) catalogue.find((p) => p.handle === l.handle).stock -= l.cans;
  products.save(catalogue);
  const now = new Date().toISOString();
  let number;
  do { number = orderNumber(); } while (orders.find((o) => o.number === number));
  const order = {
    id: crypto.randomUUID(),
    number,
    createdAt: now,
    status: 'placed',
    history: [{ status: 'placed', at: now, note: 'Order received' }],
    customer: v.customer,
    shipping: v.shipping,
    items: q.lines,
    pricing: { subtotal: q.subtotal, discount: q.discount, delivery: q.delivery, total: q.total, coupon: q.coupon, cans: q.cans },
    payment: v.payment,
    userId: v.userId,
    adminNote: '',
  };
  orders.add(order);
  return order;
}

export function publicOrder(o) {
  const { adminNote, ...rest } = o;
  return rest;
}

export function findOrderForCustomer(number, phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  const n = clean(number, 40).toUpperCase();
  const o = orders.find((x) => x.number === n && x.customer.phone === phone);
  if (!o) throw new HttpError(404, 'We could not find an order with that number and phone.');
  return o;
}

export function setStatus(o, status, note = '') {
  if (!STATUSES.includes(status)) throw new HttpError(422, 'Unknown status');
  if (o.status === status) return o;
  const catalogue = products.get();
  // cancelling returns the cans to stock; un-cancelling takes them again
  if (status === 'cancelled' && o.status !== 'cancelled') {
    for (const l of o.items) { const p = catalogue.find((x) => x.handle === l.handle); if (p) p.stock += l.cans; }
    products.save(catalogue);
    if (o.payment.status === 'awaiting') o.payment.status = 'failed';
  } else if (o.status === 'cancelled' && status !== 'cancelled') {
    for (const l of o.items) { const p = catalogue.find((x) => x.handle === l.handle); if (p) p.stock = Math.max(0, p.stock - l.cans); }
    products.save(catalogue);
  }
  o.status = status;
  o.history.push({ status, at: new Date().toISOString(), note: clean(note, 200) });
  if (status === 'delivered' && o.payment.method === 'cod') o.payment.status = 'paid';
  orders.save();
  return o;
}
