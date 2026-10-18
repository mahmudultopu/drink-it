// Orders: server-side pricing, validation, creation, tracking and status changes.
//
// The browser only ever sends *what* to buy (handle, pack, quantity). Every price, discount, delivery fee and stock
// check is recomputed here from the catalogue, so a tampered request cannot change what an order costs.
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

// Limits that keep a single request (or a single prank order) from tying up stock or the server.
const MAX_LINES = 60;
const MAX_QTY_PER_LINE = 99;
const MAX_CANS_PER_ORDER = 600;

// Unambiguous characters only (no 0/O, 1/I), so an order number can be read out over the phone.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Order numbers look like DI-261019-K7QF: the Bangladesh date plus four random characters. */
function orderNumber() {
  const d = new Date(Date.now() + 6 * 3600_000);
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  let rand = '';
  for (const b of crypto.randomBytes(4)) rand += ALPHABET[b % ALPHABET.length];
  return `DI-${ymd}-${rand}`;
}

/** Dhaka-area addresses pay the inside-Dhaka fee; everything else the outside fee. Large orders ship free. */
function deliveryFee(shipping, subtotal) {
  const d = site.get().delivery;
  const zone = d.dhakaZone || ['Dhaka', 'Gazipur', 'Narayanganj'];
  const base = shipping.division === 'Dhaka' && zone.includes(shipping.district) ? d.dhaka : d.outside;
  return subtotal >= d.freeOver ? 0 : base;
}

/** True when `phone` has already redeemed `code` on an order that was not cancelled. */
const couponUsedBy = (code, phone) =>
  !!phone &&
  orders.some((o) => o.status !== 'cancelled' && o.customer.phone === phone && o.pricing.coupon?.code === code);

/**
 * Validate a coupon for a subtotal.
 * @param {string} codeRaw code as typed by the customer
 * @param {number} subtotal basket value before discounts
 * @param {string | null} [phone] customer's number, used for single-use coupons (known only at checkout)
 * @returns {{ coupon: { code: string, label: string } | null, discount: number, freeShipping: boolean }}
 * @throws {HttpError} 422 with `fields.coupon` when the code cannot be applied
 */
export function applyCoupon(codeRaw, subtotal, phone = null) {
  const code = clean(codeRaw, 30).toUpperCase();
  if (!code) return { coupon: null, discount: 0, freeShipping: false };
  const c = coupons.get().find((x) => x.code === code && x.active);
  if (!c) throw new HttpError(422, 'That coupon code is not valid.', { fields: { coupon: 'Invalid coupon code' } });
  if (subtotal < c.minSubtotal) {
    throw new HttpError(422, `This coupon needs a minimum order of ৳${c.minSubtotal}.`, {
      fields: { coupon: `Minimum order ৳${c.minSubtotal}` },
    });
  }
  if (c.oncePerCustomer && couponUsedBy(code, phone)) {
    throw new HttpError(422, 'This coupon has already been used with your phone number.', {
      fields: { coupon: 'Already used' },
    });
  }
  if (c.type === 'shipping') return { coupon: { code: c.code, label: c.label }, discount: 0, freeShipping: true };
  let discount = c.type === 'percent' ? Math.floor((subtotal * c.value) / 100) : c.value;
  if (c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
  discount = Math.min(discount, subtotal); // a coupon can never make an order cost less than nothing
  return { coupon: { code: c.code, label: c.label }, discount, freeShipping: false };
}

/**
 * Price a basket against the live catalogue and check stock.
 * @param {Array<{ handle: string, pack?: string, qty: number }>} rawItems untrusted cart lines
 * @param {{ shipping?: object, coupon?: string, phone?: string | null }} [options]
 * @returns the priced lines plus subtotal, discount, delivery, total and number of cans
 * @throws {HttpError} 422 for an invalid basket or coupon, 409 when stock is short
 */
export function quote(rawItems, { shipping = {}, coupon = '', phone = null } = {}) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new HttpError(422, 'Your cart is empty.');
  if (rawItems.length > MAX_LINES) throw new HttpError(422, 'Too many items in one order.');
  const catalogue = products.get();

  // Merge duplicate lines (same product and pack) so the stock check below sees the true total.
  const merged = new Map();
  for (const it of rawItems) {
    const handle = clean(it?.handle, 120);
    const pack = clean(it?.pack, 20) || 'single';
    const qty = Math.floor(Number(it?.qty));
    if (!handle || !Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new HttpError(422, 'One of the cart items is invalid.');
    }
    const key = `${handle}|${pack}`;
    merged.set(key, { handle, pack, qty: (merged.get(key)?.qty || 0) + qty });
  }

  const lines = [];
  const needed = new Map(); // product handle -> cans across all of its pack lines
  for (const { handle, pack, qty } of merged.values()) {
    const p = catalogue.find((x) => x.handle === handle);
    if (!p) throw new HttpError(422, 'A product in your cart is no longer available.');
    const pk = p.packs.find((x) => x.id === pack);
    if (!pk) throw new HttpError(422, `Pack option "${pack}" is not available for ${p.title}.`);
    const cans = pk.qty * qty;
    needed.set(p.handle, (needed.get(p.handle) || 0) + cans);
    lines.push({
      handle: p.handle,
      title: p.title,
      brand: p.brand,
      pack: pk.id,
      packLabel: pk.label,
      packQty: pk.qty,
      qty,
      cans,
      unitPrice: pk.price,
      lineTotal: pk.price * qty,
      image: p.images.thumb,
      packImage: pk.id === 'single' ? p.images.thumb : p.images[pk.id] || p.images.thumb,
      tile: p.tile,
    });
  }

  const totalCans = lines.reduce((s, l) => s + l.cans, 0);
  if (totalCans > MAX_CANS_PER_ORDER) {
    throw new HttpError(
      422,
      `One order can carry at most ${MAX_CANS_PER_ORDER} cans. Please split it into two orders.`,
    );
  }
  for (const [handle, cans] of needed) {
    const p = catalogue.find((x) => x.handle === handle);
    if (p.stock < cans) {
      throw new HttpError(
        409,
        p.stock > 0 ? `Only ${p.stock} cans of ${p.title} are left in stock.` : `${p.title} is sold out.`,
        { handle, stock: p.stock },
      );
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const c = applyCoupon(coupon, subtotal, phone);
  const delivery = c.freeShipping ? 0 : deliveryFee(shipping, subtotal);
  return {
    lines,
    subtotal,
    discount: c.discount,
    delivery,
    total: subtotal - c.discount + delivery,
    coupon: c.coupon,
    cans: totalCans,
  };
}

/** Validate the customer, address and payment parts of a checkout request. Returns clean values or throws 422. */
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
  // Object.hasOwn: a division called "constructor" or "__proto__" must not resolve to something on the prototype.
  if (!Object.hasOwn(divisions, shipping.division)) errors.division = 'Choose your division.';
  else if (!divisions[shipping.division].includes(shipping.district)) errors.district = 'Choose your district.';
  if (shipping.area.length < 2) errors.area = 'Enter your area / thana.';
  if (shipping.address.length < 5) errors.address = 'Enter your full delivery address.';

  const payments = site.get().payments;
  const method = clean(body.payment?.method, 20);
  const conf = Object.hasOwn(payments, method) ? payments[method] : null;
  const payment = { method, status: 'cod', trxId: '', sender: '' };
  if (!conf || !conf.enabled) errors.method = 'Choose an available payment method.';
  else if (method !== 'cod') {
    // Mobile-money orders are paid up front: the customer sends money and quotes the transaction ID, which an
    // administrator checks against the merchant statement before confirming the order.
    payment.trxId = clean(body.payment?.trxId, 24).toUpperCase();
    payment.sender = normalizePhone(body.payment?.sender) || '';
    if (!/^[A-Z0-9]{6,24}$/.test(payment.trxId)) errors.trxId = 'Enter the transaction ID from your payment message.';
    else if (orders.some((o) => o.status !== 'cancelled' && o.payment.trxId === payment.trxId)) {
      errors.trxId = 'This transaction ID has already been used for another order.';
    }
    if (!payment.sender) errors.sender = 'Enter the mobile number you paid from.';
    payment.status = 'awaiting';
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Please fix the highlighted fields.', { fields: errors });
  return { customer, shipping, payment, userId: user?.id || null };
}

/**
 * Create an order from a checkout request and reserve its stock.
 * Everything between the stock check in quote() and the stock deduction is synchronous, so two requests cannot both
 * claim the last can.
 * @param {object} body parsed JSON body of POST /api/orders
 * @param {object | null} user the logged-in customer, if any
 */
export function placeOrder(body, user) {
  const v = validateCustomer(body, user);
  const q = quote(body.items, { shipping: v.shipping, coupon: body.coupon, phone: v.customer.phone });
  const catalogue = products.get();
  for (const l of q.lines) catalogue.find((p) => p.handle === l.handle).stock -= l.cans;
  products.save(catalogue);

  const now = new Date().toISOString();
  let number;
  do {
    number = orderNumber();
  } while (orders.find((o) => o.number === number));

  const order = {
    id: crypto.randomUUID(),
    number,
    createdAt: now,
    status: 'placed',
    history: [{ status: 'placed', at: now, note: 'Order received' }],
    customer: v.customer,
    shipping: v.shipping,
    items: q.lines,
    pricing: {
      subtotal: q.subtotal,
      discount: q.discount,
      delivery: q.delivery,
      total: q.total,
      coupon: q.coupon,
      cans: q.cans,
    },
    payment: v.payment,
    userId: v.userId,
    adminNote: '',
  };
  orders.add(order);
  return order;
}

/** The view of an order that customers may see: no internal notes and no account id. */
export function publicOrder(o) {
  const { adminNote: _adminNote, userId: _userId, ...rest } = o;
  return rest;
}

/**
 * Find an order from its number *and* the phone it was placed with. Requiring both keeps order details private
 * even though order numbers are short.
 * @throws {HttpError} 404 with the same message whether the number or the phone was wrong
 */
export function findOrderForCustomer(number, phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  const n = clean(number, 40).toUpperCase();
  const o = phone && orders.find((x) => x.number === n && x.customer.phone === phone);
  if (!o) throw new HttpError(404, 'We could not find an order with that number and phone.');
  return o;
}

/**
 * Move an order to a new status and record it in its history. Cancelling returns the cans to stock; reopening a
 * cancelled order takes them out again.
 */
export function setStatus(o, status, note = '') {
  if (!STATUSES.includes(status)) throw new HttpError(422, 'Unknown status');
  if (o.status === status) return o;
  const catalogue = products.get();
  if (status === 'cancelled' && o.status !== 'cancelled') {
    for (const l of o.items) {
      const p = catalogue.find((x) => x.handle === l.handle);
      if (p) p.stock += l.cans;
    }
    products.save(catalogue);
    if (o.payment.status === 'awaiting') o.payment.status = 'failed';
  } else if (o.status === 'cancelled' && status !== 'cancelled') {
    for (const l of o.items) {
      const p = catalogue.find((x) => x.handle === l.handle);
      if (p) p.stock = Math.max(0, p.stock - l.cans);
    }
    products.save(catalogue);
  }
  o.status = status;
  o.history.push({ status, at: new Date().toISOString(), note: clean(note, 200) });
  // cash on delivery is collected by the rider, so a delivered COD order is a paid one
  if (status === 'delivered' && o.payment.method === 'cod') o.payment.status = 'paid';
  orders.save();
  return o;
}
