// Product card: markup + behaviour (pack swatches, add to cart, wishlist, compare).
import { html, raw, money, stars, discountPct, countdownHtml, icon, toast, startCountdowns } from './ui.js';
import { Store } from './store.js';

export function priceHtml(pk) {
  return html`<span class="price">${money(pk.price)}${pk.compareAt > pk.price ? raw(`<s>${money(pk.compareAt)}</s>`) : ''}</span>`;
}

export function productCard(p, { pack = 'single', eager = false, swatches = true } = {}) {
  const pk = Store.pack(p, pack);
  const soldOut = p.stock <= 0 || !pk.available;
  const disc = discountPct(pk.price, pk.compareAt);
  const wished = Store.inWishlist(p.handle);
  const compared = Store.compareList().includes(p.handle);
  const packs = p.packs.filter((x) => x.available);
  return html`<article class="pcard${soldOut ? ' pcard--soldout' : ''}" data-handle="${p.handle}" data-pack="${pk.id}">
  <div class="pcard__media" style="--tile:${p.tile}">
    <a class="pcard__link" href="/products/${p.handle}" aria-label="${p.title}">
      <img class="pcard__img pcard__img--main" src="${p.images[pk.id] || p.images.single}" alt="${p.title}" ${raw(eager ? 'fetchpriority="high"' : 'loading="lazy"')} width="300" height="300">
      <img class="pcard__img pcard__img--hover" src="${p.images.angle}" alt="" aria-hidden="true" loading="lazy" width="300" height="300">
    </a>
    <div class="pcard__badges">${p.stock <= 0 ? raw('<span class="badge" data-badge>Sold out</span>') : disc ? raw(`<span class="badge" data-badge>-${disc}%</span>`) : ''}${p.badges.includes('new') && p.stock > 0 ? raw('<span class="badge badge--crimson">New</span>') : ''}</div>
    <div class="pcard__tools">
      <button class="round-btn${wished ? ' is-active' : ''}" type="button" data-wish aria-label="Add to wishlist" aria-pressed="${String(wished)}">${icon('heart')}</button>
      <button class="round-btn${compared ? ' is-active' : ''}" type="button" data-compare aria-label="Add to compare" aria-pressed="${String(compared)}">${icon('compare')}</button>
    </div>
    ${p.dealEndsAt && p.stock > 0 ? raw(`<div class="pcard__cd">${countdownHtml(p.dealEndsAt)}</div>`) : ''}
    <button class="btn btn--lime btn--block pcard__add" type="button" data-add ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold out' : 'Add to cart'}</button>
  </div>
  <div class="pcard__info">
    ${p.reviewCount ? stars(p.rating) : ''}
    <h3 class="pcard__title"><a href="/products/${p.handle}">${p.title}</a></h3>
    <div data-price>${priceHtml(pk)}</div>
    ${swatches && packs.length > 1 ? raw(`<div class="swatches" role="group" aria-label="Pack size">${packs.map((x) => `<button class="swatch${x.id === pk.id ? ' is-active' : ''}" type="button" data-swatch="${x.id}" title="${x.label}" aria-label="${x.label}" aria-pressed="${x.id === pk.id}"><img src="${p.images[x.id] || p.images.single}" alt="" loading="lazy"></button>`).join('')}</div>`) : ''}
  </div>
</article>`;
}

/** Render a list of products into a grid element. */
export function renderGrid(el, list, opts = {}) {
  if (!el) return;
  el.innerHTML = String(html`${list.map((p, i) => productCard(p, { eager: opts.eager && i < 4 }))}`);
  startCountdowns();
}

function selectPack(card, packId) {
  const p = Store.get(card.dataset.handle);
  const pk = Store.pack(p, packId);
  card.dataset.pack = pk.id;
  card.querySelectorAll('[data-swatch]').forEach((b) => { const on = b.dataset.swatch === pk.id; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
  const img = card.querySelector('.pcard__img--main');
  img.src = p.images[pk.id] || p.images.single;
  card.querySelector('[data-price]').innerHTML = String(priceHtml(pk));
  const disc = discountPct(pk.price, pk.compareAt);
  const b = card.querySelector('[data-badge]');
  if (b && p.stock > 0) b.textContent = disc ? `-${disc}%` : '';
  else if (!b && disc && p.stock > 0) card.querySelector('.pcard__badges').insertAdjacentHTML('afterbegin', `<span class="badge" data-badge>-${disc}%</span>`);
  const add = card.querySelector('[data-add]');
  add.disabled = !pk.available;
  add.textContent = pk.available ? 'Add to cart' : 'Sold out';
}

export function syncCards(root = document) {
  const wish = new Set(Store.wishlist());
  const cmp = new Set(Store.compareList());
  root.querySelectorAll('.pcard[data-handle]').forEach((card) => {
    const h = card.dataset.handle;
    const w = card.querySelector('[data-wish]');
    const c = card.querySelector('[data-compare]');
    if (w) { w.classList.toggle('is-active', wish.has(h)); w.setAttribute('aria-pressed', wish.has(h)); }
    if (c) { c.classList.toggle('is-active', cmp.has(h)); c.setAttribute('aria-pressed', cmp.has(h)); }
  });
}

let bound = false;
export function bindCards() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.pcard[data-handle]');
    if (!card) return;
    const handle = card.dataset.handle;
    const product = Store.get(handle);
    if (!product) return;
    const sw = e.target.closest('[data-swatch]');
    if (sw) { e.preventDefault(); selectPack(card, sw.dataset.swatch); return; }
    if (e.target.closest('[data-add]')) {
      e.preventDefault();
      Store.addToCart(handle, card.dataset.pack || 'single', 1);
      return;
    }
    if (e.target.closest('[data-wish]')) {
      e.preventDefault();
      const added = Store.toggleWishlist(handle);
      toast(added ? `${product.title} saved to your wishlist.` : 'Removed from wishlist.', added ? { image: product.images.single, href: '/wishlist', label: 'View' } : {});
      return;
    }
    if (e.target.closest('[data-compare]')) {
      e.preventDefault();
      const r = Store.toggleCompare(handle);
      if (r === 'full') toast('You can compare up to 4 cans at a time.', { type: 'error' });
      else toast(r === 'added' ? `${product.title} added to compare.` : 'Removed from compare.', r === 'added' ? { image: product.images.single, href: '/compare', label: 'Compare' } : {});
    }
  });
  Store.on('wish', () => syncCards());
  Store.on('compare', () => syncCards());
}
