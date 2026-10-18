import { $, html, startCountdowns, toast } from '../ui.js';
import { Store } from '../store.js';
import { productCard } from '../card.js';

export function init() {
  const root = $('[data-wishlist]');
  const btn = $('[data-add-all]');
  const render = () => {
    const list = Store.wishlist()
      .map((h) => Store.get(h))
      .filter(Boolean);
    btn.hidden = !list.length;
    if (!list.length) {
      root.innerHTML = String(
        html`<div class="empty"><h3>Nothing saved yet</h3><p>Tap the heart on any can to save it here.</p><a class="btn" href="/collections/all">Browse cans</a></div>`,
      );
      return;
    }
    root.innerHTML = String(html`<div class="pgrid pgrid--light">${list.map((p) => productCard(p))}</div>`);
    startCountdowns();
  };
  btn.addEventListener('click', () => {
    let n = 0;
    for (const h of Store.wishlist()) {
      const p = Store.get(h);
      if (p && p.stock > 0 && Store.addToCart(h, 'single', 1, { silent: true })) n++;
    }
    if (n) {
      toast(`${n} can${n > 1 ? 's' : ''} added to your cart.`, { href: '/cart', label: 'View cart' });
    }
  });
  Store.on('wish', render);
  render();
}
