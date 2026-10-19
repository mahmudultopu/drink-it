// Track an order: order number + phone number, prefilled from the query string, the last order of this tab and the
// signed-in customer's own number.
import { $ } from '../ui.js';
import { Store } from '../store.js';
import { api } from '../api.js';
import { orderCard } from '../order-view.js';

export function init() {
  const form = $('[data-track-form]');
  const out = $('[data-track-result]');
  const err = $('[data-track-error]');
  const sp = new URLSearchParams(location.search);
  if (sp.get('number')) form.elements.number.value = sp.get('number');
  try {
    const last = JSON.parse(sessionStorage.getItem('drinkit.last') || 'null');
    if (last) {
      form.elements.number.value ||= last.number;
      form.elements.phone.value ||= last.phone;
    }
  } catch {
    /* ignore */
  }
  if (Store.user) form.elements.phone.value ||= Store.user.phone;

  const run = async () => {
    err.hidden = true;
    const btn = $('button[type=submit]', form);
    btn.classList.add('is-loading');
    try {
      const { order } = await api(
        `/orders/lookup?number=${encodeURIComponent(form.elements.number.value.trim())}&phone=${encodeURIComponent(form.elements.phone.value.trim())}`,
      );
      out.innerHTML = String(orderCard(order, Store.site));
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      out.innerHTML = '';
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      btn.classList.remove('is-loading');
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  if (sp.get('number') && form.elements.phone.value) run();
}
