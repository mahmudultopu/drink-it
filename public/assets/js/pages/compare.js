import { $, html, raw, money, stars } from '../ui.js';
import { Store } from '../store.js';

const ROWS = [
  [
    'Price',
    (p) =>
      html`<b>${money(p.price)}</b>${p.compareAt > p.price ? raw(` <s class="muted">${money(p.compareAt)}</s>`) : ''}`,
  ],
  [
    'Rating',
    (p) =>
      p.reviewCount
        ? html`${stars(p.rating, 'stars--sm')} <span class="muted">(${p.reviewCount})</span>`
        : 'No reviews yet',
  ],
  ['Brand', (p) => p.brand],
  ['Flavor', (p) => p.type],
  ['Can size', (p) => `${p.canMl} ml`],
  ['Sugar', (p) => (p.sugar === 'Zero' ? 'Zero sugar' : 'Regular')],
  ['Caffeine', (p) => (p.caffeine ? 'Contains caffeine' : 'Caffeine-free')],
  ['Origin', (p) => (p.origin === 'Imported' ? 'Imported' : 'Bottled in Bangladesh')],
  ['Cheapest per can', (p) => money(Math.round(Math.min(...p.packs.map((k) => k.price / k.qty)) * 10) / 10)],
  ['Availability', (p) => (p.stock > 0 ? 'In stock' : 'Sold out')],
];

export function init() {
  const root = $('[data-compare]');
  const render = () => {
    const list = Store.compareList()
      .map((h) => Store.get(h))
      .filter(Boolean);
    if (!list.length) {
      root.innerHTML = String(
        html`<div class="empty"><h3>Nothing to compare yet</h3><p>Use the compare icon on any can (up to four) to see them side by side.</p><a class="btn" href="/collections/all">Browse cans</a></div>`,
      );
      return;
    }
    root.innerHTML =
      String(html`<table><thead><tr><th></th>${list.map((p) => html`<td class="cmp__head"><span class="oitems__img" style="--tile:${p.tile}"><img src="${p.images.thumb}" alt=""></span><a href="/products/${p.handle}">${p.title}</a><button class="btn btn--sm" type="button" data-add="${p.handle}" ${p.stock > 0 ? '' : 'disabled'}>Add to cart</button><br><button class="link-btn" type="button" data-rm="${p.handle}" style="margin-top:10px;font-size:14px">Remove</button></td>`)}</tr></thead>
      <tbody>${ROWS.map(([label, fn]) => html`<tr><th scope="row">${label}</th>${list.map((p) => html`<td>${fn(p)}</td>`)}</tr>`)}</tbody></table>`);
  };
  root.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) Store.addToCart(add.dataset.add, 'single', 1);
    const rm = e.target.closest('[data-rm]');
    if (rm) Store.toggleCompare(rm.dataset.rm);
  });
  Store.on('compare', render);
  render();
}
