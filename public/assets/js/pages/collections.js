import { $, html, money, initReveal } from '../ui.js';
import { Store } from '../store.js';
import { api } from '../api.js';
import { bannerHtml, accordionHtml } from '../sections.js';

export async function init() {
  $('[data-collections-banner]').innerHTML = String(
    bannerHtml({
      title: 'Collections',
      text: 'Discover every can in the Drink it store — cola classics, citrus fizz, energy boosters, zero-sugar picks and imported favourites. Find your favourite and dive into a world of fizzy fun!',
    }),
  );
  const cols = Store.collections; // six tiles, two rows of three, like the reference theme
  $('[data-cindex]').innerHTML = String(
    html`${cols.map((c) => {
      const lead = Store.get(c.lead);
      return html`<a class="cindex__tile" href="/collections/${c.handle}" style="--tile:${lead?.tile};--accent:${lead?.ink || 'var(--green)'}" data-reveal="up">
      <img src="${lead?.images.single}" alt="" loading="lazy">
      <strong>${c.title}</strong>
      <small>${c.count} cans · from ${money(Math.min(...Store.products.filter((p) => c.handle === 'all' || p.collections.includes(c.handle)).map((p) => p.price)))}</small>
    </a>`;
    })}`,
  );
  try {
    const { faq } = await api('/faq');
    $('[data-faq]').innerHTML = String(accordionHtml(faq.slice(0, 6)));
  } catch {
    /* optional */
  }
  initReveal();
}
