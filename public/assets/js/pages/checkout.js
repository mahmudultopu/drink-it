// Checkout: contact + Bangladeshi delivery address + payment (COD / bKash / Nagad / Rocket) with a live server quote.
import { $, $$, html, esc, money, toast } from '../ui.js';
import { Store } from '../store.js';
import { api } from '../api.js';
import { freeDeliveryHtml } from '../chrome.js';

const PAY_ORDER = ['cod', 'bkash', 'nagad', 'rocket', 'card'];
const PAY_CHIP = { cod: 'COD', bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', card: 'Card' };

export function init() {
  const root = $('[data-checkout-root]');
  const site = Store.site;
  if (!Store.cartLines().length) {
    root.innerHTML = String(
      html`<div class="empty"><h3>Your cart is empty</h3><p>Add a few cans before checking out.</p><a class="btn" href="/collections/all">Shop cans</a></div>`,
    );
    return;
  }
  document.title = 'Checkout – Drink it';
  const divisions = site.divisions;
  const user = Store.user;
  let draft = {};
  try {
    draft = JSON.parse(localStorage.getItem('drinkit.checkout') || '{}');
  } catch {
    /* ignore */
  }
  const saved = user?.addresses?.[0] || {};
  const v = {
    name: user?.name || draft.name || '',
    phone: user?.phone || draft.phone || '',
    email: user?.email || draft.email || '',
    division: saved.division || draft.division || 'Dhaka',
    district: saved.district || draft.district || 'Dhaka',
    area: saved.area || draft.area || '',
    address: saved.address || draft.address || '',
    notes: '',
  };
  const methods = PAY_ORDER.filter((k) => site.payments[k]);
  const state = { coupon: '', method: 'cod', quote: null, busy: false };

  root.innerHTML = String(html`<form class="checkout__grid" data-form novalidate>
    <div class="checkout__main">
      ${user ? '' : html`<p class="checkout__login">Already have an account? <a href="/account/login?next=/checkout">Log in</a> for faster checkout.</p>`}

      <section class="cbox"><h2><span>1</span> Contact</h2>
        <div class="fgrid">
          <div class="field"><label for="c-name">Full name *</label><input class="input" id="c-name" name="name" autocomplete="name" value="${v.name}" maxlength="80" required><div class="field__error" data-err="name"></div></div>
          <div class="field"><label for="c-phone">Mobile number *</label><input class="input" id="c-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" value="${v.phone}" required><div class="field__error" data-err="phone"></div></div>
          <div class="field fgrid__full"><label for="c-email">Email <span class="muted">(optional, for your receipt)</span></label><input class="input" id="c-email" name="email" type="email" autocomplete="email" value="${v.email}"><div class="field__error" data-err="email"></div></div>
        </div>
      </section>

      <section class="cbox"><h2><span>2</span> Delivery address</h2>
        ${user?.addresses?.length ? html`<div class="field" style="margin-bottom:14px"><label for="c-saved">Saved addresses</label><select class="select" id="c-saved" data-saved><option value="">Use a new address</option>${user.addresses.map((a, i) => html`<option value="${i}" ${i === 0 ? 'selected' : ''}>${a.label} — ${a.area}, ${a.district}</option>`)}</select></div>` : ''}
        <div class="fgrid">
          <div class="field"><label for="c-div">Division *</label><select class="select" id="c-div" name="division" required>${Object.keys(divisions).map((d) => html`<option ${d === v.division ? 'selected' : ''}>${d}</option>`)}</select><div class="field__error" data-err="division"></div></div>
          <div class="field"><label for="c-dist">District *</label><select class="select" id="c-dist" name="district" required></select><div class="field__error" data-err="district"></div></div>
          <div class="field fgrid__full"><label for="c-area">Area / Thana *</label><input class="input" id="c-area" name="area" autocomplete="address-level3" placeholder="e.g. Dhanmondi" value="${v.area}" maxlength="80" required><div class="field__error" data-err="area"></div></div>
          <div class="field fgrid__full"><label for="c-addr">Full address *</label><textarea class="textarea" id="c-addr" name="address" rows="3" placeholder="House, road, block, landmark" maxlength="300" required>${v.address}</textarea><div class="field__error" data-err="address"></div></div>
          <div class="field fgrid__full"><label for="c-notes">Delivery note <span class="muted">(optional)</span></label><input class="input" id="c-notes" name="notes" placeholder="e.g. call before arriving, event date" maxlength="300"></div>
        </div>
      </section>

      <section class="cbox"><h2><span>3</span> Payment</h2>
        <div class="paycards" role="radiogroup" aria-label="Payment method">
          ${methods.map((k) => {
            const m = site.payments[k];
            return html`<label class="paycard${m.enabled ? '' : ' is-disabled'}"><input type="radio" name="method" value="${k}" ${k === 'cod' ? 'checked' : ''} ${m.enabled ? '' : 'disabled'}><span class="paycard__body"><b>${m.label}</b><small>${m.hint}</small></span><span class="pay-chip pay-chip--${k === 'card' ? 'visa' : k}">${PAY_CHIP[k]}</span></label>`;
          })}
        </div>
        <div class="paybox" data-paybox hidden>
          <p data-paybox-text></p>
          <div class="fgrid">
            <div class="field"><label for="c-trx">Transaction ID (TrxID) *</label><input class="input" id="c-trx" name="trxId" autocomplete="off" placeholder="e.g. 9H7A5B3C2D" maxlength="24"><div class="field__error" data-err="trxId"></div></div>
            <div class="field"><label for="c-sender">Number you paid from *</label><input class="input" id="c-sender" name="sender" type="tel" inputmode="tel" placeholder="01XXXXXXXXX"><div class="field__error" data-err="sender"></div></div>
          </div>
        </div>
        <div class="field__error" data-err="method"></div>
      </section>

      <div class="form-note form-note--error" data-form-error hidden></div>
      <button class="btn btn--lg btn--block checkout__submit" type="submit" data-submit><span>Place order</span></button>
      <p class="checkout__legal">By placing your order you agree to our <a href="/pages/terms-condition">Terms</a> and <a href="/pages/refund-policy">Refund Policy</a>.</p>
    </div>

    <aside class="summary summary--sticky" aria-label="Order summary" data-summary></aside>
  </form>`);

  const form = $('[data-form]', root);
  const fval = (n) => form.elements[n]?.value?.trim() || '';

  // district list depends on division
  const fillDistricts = (select, keep) => {
    const list = divisions[form.elements.division.value] || [];
    form.elements.district.innerHTML = list
      .map((d) => `<option ${d === (keep || v.district) ? 'selected' : ''}>${esc(d)}</option>`)
      .join('');
  };
  fillDistricts();
  form.elements.division.addEventListener('change', () => {
    fillDistricts(null, '');
    requote();
  });
  form.elements.district.addEventListener('change', requote);

  // saved addresses
  $('[data-saved]', form)?.addEventListener('change', (e) => {
    const a = user.addresses[Number(e.target.value)];
    if (!a) return;
    form.elements.division.value = a.division;
    fillDistricts(null, a.district);
    form.elements.area.value = a.area;
    form.elements.address.value = a.address;
    requote();
  });

  // payment method UI
  const payTexts = (total) => {
    const m = site.payments[state.method];
    return `Open your ${m.label} app, choose Send Money, and send ${money(total)} to our ${m.kind} number ${m.number}. Then paste the transaction ID below so we can verify your payment.`;
  };
  const updatePay = () => {
    state.method = form.elements.method.value;
    const box = $('[data-paybox]', form);
    box.hidden = state.method === 'cod';
    if (state.method !== 'cod')
      $('[data-paybox-text]', form).textContent = payTexts(state.quote?.total ?? Store.cartSubtotal());
    $$('.paycard', form).forEach((c) => c.classList.toggle('is-selected', c.querySelector('input').checked));
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'method') updatePay();
  });

  // summary + live quote
  const itemsPayload = () => Store.cartItems().map((i) => ({ handle: i.handle, pack: i.pack, qty: i.qty }));
  const renderSummary = (q, couponMsg) => {
    $('[data-summary]', root).innerHTML = String(html`<h2>Order summary</h2>
      <ul class="sum-items">${Store.cartLines().map((l) => html`<li><span class="oitems__img" style="--tile:${l.product.tile}"><img src="${l.pack.id === 'single' ? l.product.images.thumb : l.product.images[l.pack.id] || l.product.images.thumb}" alt=""><i>${l.qty}</i></span><span><b>${l.product.title}</b><small>${l.pack.label}</small></span><b>${money(l.total)}</b></li>`)}</ul>
      <div class="coupon"><label class="sr-only" for="coupon">Coupon code</label><input class="input" id="coupon" placeholder="Coupon code" value="${state.coupon}" data-coupon autocomplete="off"><button class="btn btn--sm btn--lime" type="button" data-apply>Apply</button></div>
      <p class="coupon__msg ${couponMsg?.error ? 'is-error' : ''}" data-coupon-msg>${couponMsg?.text || ''}</p>
      ${q ? freeDeliveryHtml(q.subtotal) : ''}
      <dl class="summary__rows">
        <div><dt>Subtotal</dt><dd>${q ? money(q.subtotal) : '…'}</dd></div>
        ${q?.discount ? html`<div class="is-good"><dt>Discount${q.coupon ? ` (${q.coupon.code})` : ''}</dt><dd>−${money(q.discount)}</dd></div>` : ''}
        <div><dt>Delivery</dt><dd>${q ? (q.delivery ? money(q.delivery) : 'Free') : '…'}</dd></div>
      </dl>
      <div class="summary__total"><span>Total</span><b>${q ? money(q.total) : '…'}</b></div>`);
    $('[data-apply]', root).addEventListener('click', () => {
      state.coupon = $('[data-coupon]', root).value.trim().toUpperCase();
      requote(true);
    });
    $('[data-coupon]', root).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        state.coupon = e.target.value.trim().toUpperCase();
        requote(true);
      }
    });
  };
  async function requote(showMsg = false) {
    try {
      const { quote } = await api('/quote', {
        method: 'POST',
        body: {
          items: itemsPayload(),
          shipping: { division: form.elements.division.value, district: form.elements.district.value },
          coupon: state.coupon,
        },
      });
      state.quote = quote;
      let msg = null;
      if (quote.couponError) msg = { error: true, text: quote.couponError };
      else if (quote.coupon && showMsg) msg = { text: `✓ ${quote.coupon.label}` };
      else if (quote.coupon) msg = { text: `✓ ${quote.coupon.code} applied` };
      renderSummary(quote, msg);
      updatePay();
    } catch (err) {
      renderSummary(null, { error: true, text: err.message });
      if (err.status === 409 || err.status === 422) toast(err.message, { type: 'error' });
    }
  }
  renderSummary(null);
  requote();
  updatePay();

  // submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    $$('[data-err]', form).forEach((x) => {
      x.textContent = '';
      x.closest('.field')?.classList.remove('has-error');
    });
    $('[data-form-error]', form).hidden = true;
    const body = {
      items: itemsPayload(),
      coupon: state.coupon,
      customer: { name: fval('name'), phone: fval('phone'), email: fval('email') },
      shipping: {
        division: fval('division'),
        district: fval('district'),
        area: fval('area'),
        address: fval('address'),
        notes: fval('notes'),
      },
      payment: { method: state.method, trxId: fval('trxId'), sender: fval('sender') },
    };
    state.busy = true;
    const btn = $('[data-submit]', form);
    btn.classList.add('is-loading');
    try {
      const { order } = await api('/orders', { method: 'POST', body });
      try {
        localStorage.setItem(
          'drinkit.checkout',
          JSON.stringify({ ...body.customer, ...body.shipping, notes: undefined }),
        );
        sessionStorage.setItem('drinkit.last', JSON.stringify({ number: order.number, phone: order.customer.phone }));
      } catch {
        /* ignore */
      }
      Store.clearCart();
      location.href = `/orders/${order.number}`;
    } catch (err) {
      const fields = err.fields || {};
      for (const [k, msg] of Object.entries(fields)) {
        const el = $(`[data-err="${k}"]`, form);
        if (el) {
          el.textContent = msg;
          el.closest('.field')?.classList.add('has-error');
        }
      }
      const note = $('[data-form-error]', form);
      note.textContent = err.message;
      note.hidden = false;
      const first = $('.has-error input, .has-error select, .has-error textarea', form);
      (first || note).scrollIntoView({ behavior: 'smooth', block: 'center' });
      first?.focus({ preventScroll: true });
      if (err.status === 409) requote();
    } finally {
      state.busy = false;
      btn.classList.remove('is-loading');
    }
  });
}
