// Cart page: full-size cart with quantity controls and an order summary.
import { $, $$, html, raw, esc, money, icon, startCountdowns } from '../ui.js';
import { Store } from '../store.js';
import { productCard } from '../card.js';
import { freeDeliveryHtml } from '../chrome.js';

function lineHtml(l) {
  const { product: p, pack, qty } = l;
  return html`<li class="cart-row cline" data-handle="${p.handle}" data-pack="${pack.id}">
    <a class="cart-row__img" href="/products/${p.handle}" style="--tile:${p.tile}"><img src="${p.images[pack.id] || p.images.single}" alt="${p.title}" width="110" height="110"></a>
    <div class="cart-row__info">
      <a class="cart-row__title" href="/products/${p.handle}">${p.title}</a>
      <p class="cart-row__meta">${pack.label}${pack.qty > 1 ? ` · ${pack.qty} cans` : ''} · ${p.canMl} ml</p>
      <p class="cart-row__unit">${money(pack.price)} each${pack.compareAt > pack.price ? raw(` <s>${money(pack.compareAt)}</s>`) : ''}</p>
    </div>
    <div class="qty" aria-label="Quantity for ${p.title}"><button type="button" data-dec aria-label="Decrease quantity">${icon('minus')}</button><input type="text" inputmode="numeric" value="${qty}" aria-label="Quantity" data-qty><button type="button" data-inc aria-label="Increase quantity">${icon('plus')}</button></div>
    <b class="cart-row__total">${money(l.total)}</b>
    <button class="icon-btn cart-row__rm" type="button" data-remove aria-label="Remove ${p.title}">${icon('trash')}</button>
  </li>`;
}

export function init() {
  const root = $('[data-cart-page]');
  const render = () => {
    const lines = Store.cartLines();
    if (!lines.length) {
      root.innerHTML = String(html`<div class="cart-empty-page"><p>Have an account? <a href="/account/login">Log in</a> to check out faster.</p><a class="btn" href="/collections/all">Continue shopping</a></div>`);
      return;
    }
    const sub = lines.reduce((s, l) => s + l.total, 0);
    const cans = lines.reduce((s, l) => s + l.cans, 0);
    root.innerHTML = String(html`<div class="cart-layout">
      <div class="cart-lines">
        <div class="cart-lines__head"><span>Product</span><span>Quantity</span><span>Total</span></div>
        <ul>${lines.map(lineHtml)}</ul>
        <div class="cart-lines__foot"><a class="link-btn" href="/collections/all">← Continue shopping</a><button class="link-btn" type="button" data-clear>Clear cart</button></div>
      </div>
      <aside class="summary" aria-label="Order summary">
        <h2>Order summary</h2>
        ${freeDeliveryHtml(sub)}
        <dl class="summary__rows">
          <div><dt>${cans} can${cans === 1 ? '' : 's'}</dt><dd>${money(sub)}</dd></div>
          <div><dt>Delivery</dt><dd class="muted">Calculated at checkout</dd></div>
        </dl>
        <div class="summary__total"><span>Estimated total</span><b>${money(sub)}</b></div>
        <a class="btn btn--block" href="/checkout">Checkout</a>
        <p class="summary__note">Have a coupon? You can apply it at checkout.</p>
        <div class="pay-chips pay-chips--dark" aria-label="Accepted payments"><span class="pay-chip pay-chip--bkash">bKash</span><span class="pay-chip pay-chip--nagad">Nagad</span><span class="pay-chip pay-chip--rocket">Rocket</span><span class="pay-chip pay-chip--cod">Cash on delivery</span></div>
      </aside>
    </div>`);
  };
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) { Store.clearCart(); return; }
    const li = e.target.closest('.cline');
    if (!li) return;
    const { handle, pack } = li.dataset;
    const cur = Store.cartItems().find((i) => i.handle === handle && i.pack === pack);
    if (e.target.closest('[data-inc]')) Store.setQty(handle, pack, (cur?.qty || 1) + 1);
    else if (e.target.closest('[data-dec]')) { if ((cur?.qty || 1) > 1) Store.setQty(handle, pack, cur.qty - 1); else Store.removeFromCart(handle, pack); }
    else if (e.target.closest('[data-remove]')) Store.removeFromCart(handle, pack);
  });
  root.addEventListener('change', (e) => {
    const input = e.target.closest('[data-qty]');
    if (!input) return;
    const li = input.closest('.cline');
    const n = parseInt(input.value, 10);
    if (n >= 1) Store.setQty(li.dataset.handle, li.dataset.pack, n); else render();
  });
  Store.on('cart', render);
  render();

  // suggestions
  const inCart = new Set(Store.cartItems().map((i) => i.handle));
  const picks = Store.products.filter((p) => !inCart.has(p.handle)).sort((a, b) => b.sold - a.sold).slice(0, 4);
  if (picks.length) {
    $('[data-also]').hidden = false;
    $('[data-also-grid]').innerHTML = String(html`${picks.map((p) => productCard(p))}`);
    startCountdowns();
  }
}
