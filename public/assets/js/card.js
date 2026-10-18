// Product card: markup + behaviour (pack swatches, add to cart, wishlist, compare).
import { html, raw, money, stars, discountPct, countdownHtml, icon, toast, startCountdowns } from './ui.js';
import { Store } from './store.js';

export function priceHtml(pk) {
  return html`<span class="price">${money(pk.price)}${pk.compareAt > pk.price ? raw(`<s>${money(pk.compareAt)}</s>`) : ''}</span>`;
}

/** Pack-size buttons shown under a card. Built with html`` so catalogue values are escaped. */
function swatchesHtml(packs, currentId, p) {
  return html`<div class="swatches" role="group" aria-label="Pack size">${packs.map(
    (x) =>
      html`<button class="swatch${x.id === currentId ? ' is-active' : ''}" type="button" data-swatch="${x.id}" title="${x.label}" aria-label="${x.label}" aria-pressed="${String(x.id === currentId)}"><img src="${Store.packImage(p, x.id)}" alt="" loading="lazy" width="36" height="36"></button>`,
  )}</div>`;
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
      <img class="pcard__img pcard__img--main" src="${Store.packImage(p, pk.id, 'card')}" alt="${p.title}" ${raw(eager ? 'fetchpriority="high"' : 'loading="lazy"')} width="300" height="300">
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
    ${swatches && packs.length > 1 ? swatchesHtml(packs, pk.id, p) : ''}
  </div>
</article>`;
}

/**
 * The alternate-angle photo is only fetched once someone points at (or tabs into) a card, so a grid of 30 cards does
 * not download 30 pictures that most visitors never see. The swap in CSS waits for the picture, via .has-hover.
 */
function addHoverImage(card) {
  const link = card.querySelector('.pcard__link');
  const product = Store.get(card.dataset.handle);
  if (!link || !product || card.dataset.hoverImage) return;
  card.dataset.hoverImage = '1';
  const img = document.createElement('img');
  img.className = 'pcard__img pcard__img--hover';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.width = 300;
  img.height = 300;
  img.decoding = 'async';
  img.addEventListener('load', () => card.classList.add('has-hover'), { once: true });
  img.src = product.images.angle;
  link.append(img);
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
  card.querySelectorAll('[data-swatch]').forEach((b) => {
    const on = b.dataset.swatch === pk.id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', on);
  });
  const img = card.querySelector('.pcard__img--main');
  img.src = Store.packImage(p, pk.id, 'card');
  card.querySelector('[data-price]').innerHTML = String(priceHtml(pk));
  const disc = discountPct(pk.price, pk.compareAt);
  const b = card.querySelector('[data-badge]');
  if (b && p.stock > 0) b.textContent = disc ? `-${disc}%` : '';
  else if (!b && disc && p.stock > 0)
    card
      .querySelector('.pcard__badges')
      .insertAdjacentHTML('afterbegin', `<span class="badge" data-badge>-${disc}%</span>`);
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
    if (w) {
      w.classList.toggle('is-active', wish.has(h));
      w.setAttribute('aria-pressed', wish.has(h));
    }
    if (c) {
      c.classList.toggle('is-active', cmp.has(h));
      c.setAttribute('aria-pressed', cmp.has(h));
    }
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
    if (sw) {
      e.preventDefault();
      selectPack(card, sw.dataset.swatch);
      return;
    }
    if (e.target.closest('[data-add]')) {
      e.preventDefault();
      Store.addToCart(handle, card.dataset.pack || 'single', 1);
      return;
    }
    if (e.target.closest('[data-wish]')) {
      e.preventDefault();
      const added = Store.toggleWishlist(handle);
      toast(
        added ? `${product.title} saved to your wishlist.` : 'Removed from wishlist.',
        added ? { image: product.images.thumb, href: '/wishlist', label: 'View' } : {},
      );
      return;
    }
    if (e.target.closest('[data-compare]')) {
      e.preventDefault();
      const r = Store.toggleCompare(handle);
      if (r === 'full') toast('You can compare up to 4 cans at a time.', { type: 'error' });
      else
        toast(
          r === 'added' ? `${product.title} added to compare.` : 'Removed from compare.',
          r === 'added' ? { image: product.images.thumb, href: '/compare', label: 'Compare' } : {},
        );
    }
  });
  // Touch screens have no hover, so only a mouse or the keyboard triggers the extra photo.
  const reveal = (e) => {
    if (e.type === 'pointerover' && e.pointerType !== 'mouse') return;
    const card = e.target.closest?.('.pcard[data-handle]');
    if (card) addHoverImage(card);
  };
  document.addEventListener('pointerover', reveal, { passive: true });
  document.addEventListener('focusin', reveal);
  Store.on('wish', () => syncCards());
  Store.on('compare', () => syncCards());
}
