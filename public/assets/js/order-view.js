// Shared order summary + status timeline (confirmation page, tracking page, account).
import { html, raw, esc, money, icon, fmtDate } from './ui.js';

export const STEPS = [
  ['placed', 'Order placed', 'cart'],
  ['confirmed', 'Confirmed', 'check'],
  ['packed', 'Packed', 'box'],
  ['shipped', 'Out for delivery', 'truck'],
  ['delivered', 'Delivered', 'home'],
];
export const STATUS_LABEL = {
  placed: 'Order placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const PAY_LABEL = { cod: 'Cash on delivery', bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' };
const PAY_STATUS = {
  cod: 'Pay on delivery',
  awaiting: 'Verifying payment',
  paid: 'Paid',
  failed: 'Payment failed',
  refunded: 'Refunded',
};

const when = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

export function statusChip(status) {
  return html`<span class="chip chip--${status}">${STATUS_LABEL[status] || status}</span>`;
}

export function timelineHtml(o) {
  if (o.status === 'cancelled') {
    const at = o.history.find((h) => h.status === 'cancelled');
    return html`<div class="form-note form-note--error"><b>This order was cancelled</b>${at ? ` on ${when(at.at)}` : ''}. If you paid already we will refund you — contact us if you have questions.</div>`;
  }
  const idx = STEPS.findIndex((s) => s[0] === o.status);
  return html`<ol class="otimeline">${STEPS.map(([key, label, ic], i) => {
    const h = o.history.find((x) => x.status === key);
    return html`<li class="${i <= idx ? 'is-done' : ''}${i === idx ? ' is-current' : ''}"><span class="otimeline__dot">${icon(ic)}</span><b>${label}</b><small>${h ? when(h.at) : '—'}</small></li>`;
  })}</ol>`;
}

export function paymentInstructions(o, site) {
  const p = o.payment;
  if (p.method === 'cod')
    return html`<div class="form-note form-note--ok"><b>Cash on delivery.</b> Please keep <b>${money(o.pricing.total)}</b> ready when your cans arrive.</div>`;
  const conf = site.payments[p.method];
  if (p.status === 'awaiting') {
    return html`<div class="form-note"><b>We’re verifying your ${PAY_LABEL[p.method]} payment.</b> Transaction ID <b>${p.trxId}</b> from ${p.sender}. We’ll confirm your order by phone or message shortly. If you haven’t paid yet, send <b>${money(o.pricing.total)}</b> to ${conf.label} (${conf.kind}) <b>${conf.number}</b> and reply with the transaction ID.</div>`;
  }
  return html`<div class="form-note form-note--ok"><b>${PAY_LABEL[p.method]} — ${PAY_STATUS[p.status] || p.status}.</b></div>`;
}

export function orderCard(o, site, { showPayment = true } = {}) {
  const pr = o.pricing;
  return html`<article class="ocard">
    <header class="ocard__head">
      <div><p class="eyebrow">Order</p><h2>${o.number}</h2><small>Placed ${fmtDate(o.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</small></div>
      ${statusChip(o.status)}
    </header>
    ${timelineHtml(o)}
    ${showPayment ? paymentInstructions(o, site) : ''}
    <div class="ocard__grid">
      <section>
        <h3>Items</h3>
        <ul class="oitems">${o.items.map((l) => html`<li><span class="oitems__img" style="--tile:${l.tile}"><img src="${l.packImage || l.image}" alt=""></span><span><a href="/products/${l.handle}">${l.title}</a><small>${l.packLabel}${l.packQty > 1 ? ` · ${l.packQty} cans` : ''} × ${l.qty}</small></span><b>${money(l.lineTotal)}</b></li>`)}</ul>
        <dl class="summary__rows summary__rows--tight">
          <div><dt>Subtotal</dt><dd>${money(pr.subtotal)}</dd></div>
          ${pr.discount ? html`<div><dt>Discount${pr.coupon ? ` (${pr.coupon.code})` : ''}</dt><dd>−${money(pr.discount)}</dd></div>` : ''}
          <div><dt>Delivery</dt><dd>${pr.delivery ? money(pr.delivery) : 'Free'}</dd></div>
        </dl>
        <div class="summary__total"><span>Total</span><b>${money(pr.total)}</b></div>
      </section>
      <section>
        <h3>Delivery</h3>
        <address>${o.customer.name}<br>${o.shipping.address}<br>${o.shipping.area}, ${o.shipping.district}, ${o.shipping.division}<br>${o.customer.phone}${o.customer.email ? raw(`<br>${esc(o.customer.email)}`) : ''}</address>
        ${o.shipping.notes ? html`<p class="muted"><b>Note:</b> ${o.shipping.notes}</p>` : ''}
        <h3 style="margin-top:22px">Payment</h3>
        <p>${PAY_LABEL[o.payment.method] || o.payment.method} · ${PAY_STATUS[o.payment.status] || o.payment.status}</p>
      </section>
    </div>
  </article>`;
}
