// Order confirmation / order status page (/orders/:number).
// A visitor proves the order is theirs with its number plus the phone number it was placed with; a signed-in customer
// opening one of their own orders needs no phone number. Right after checkout the phone is remembered for this tab.
import { $, html, icon, pathSegment } from '../ui.js';
import { Store } from '../store.js';
import { api } from '../api.js';
import { orderCard } from '../order-view.js';

export async function init() {
  const root = $('[data-order-root]');
  const number = pathSegment(2).toUpperCase();
  const sp = new URLSearchParams(location.search);
  let phone = sp.get('phone') || '';
  let fresh = false;
  try {
    const last = JSON.parse(sessionStorage.getItem('drinkit.last') || 'null');
    if (!phone && last && last.number === number) {
      phone = last.phone;
      fresh = true;
    }
  } catch {
    /* ignore */
  }
  document.title = `Order ${number} – Drink it`;

  const askPhone = (msg = '') => {
    root.innerHTML =
      String(html`<div class="lookup"><h1>Order ${number}</h1><p>Enter the mobile number used for this order to view its status.</p>
      <form class="lookup__form" data-lookup novalidate><div class="field"><label for="lk-phone">Mobile number</label><input class="input" id="lk-phone" name="phone" type="tel" inputmode="tel" placeholder="01XXXXXXXXX" required></div>${msg ? html`<div class="form-note form-note--error">${msg}</div>` : ''}<button class="btn" type="submit">View order</button></form></div>`);
    $('[data-lookup]', root).addEventListener('submit', (e) => {
      e.preventDefault();
      phone = new FormData(e.target).get('phone');
      load();
    });
  };

  async function load() {
    if (!phone && !Store.user) return askPhone();
    try {
      const { order } = await api(
        `/orders/lookup?number=${encodeURIComponent(number)}&phone=${encodeURIComponent(phone)}`,
      );
      root.innerHTML =
        String(html`${fresh ? html`<div class="thanks"><span class="thanks__tick">${icon('check')}</span><h1>Thank you, ${order.customer.name.split(' ')[0]}!</h1><p>Your order <b>${order.number}</b> has been placed. ${order.customer.email ? 'We’ve noted your email for your receipt. ' : ''}We’ll confirm it shortly${order.payment.method !== 'cod' ? ' after verifying your payment' : ''}.</p></div>` : ''}
        <div class="orderwrap">${orderCard(order, Store.site)}
        <div class="orderpage__actions"><a class="btn" href="/collections/all">Continue shopping</a><a class="btn btn--lime" href="/track">Track another order</a><button class="btn btn--ghost" type="button" data-print>Print</button></div></div>`);
      fresh = false;
    } catch (err) {
      askPhone(err.status === 404 ? 'We couldn’t find an order with that number and phone.' : err.message);
    }
  }
  load();
}
