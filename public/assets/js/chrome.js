// Site chrome behaviour: announcement bar, sticky header, mega menus, drawers (cart / menu), search,
// newsletter + activity popups, scroll-to-top and the mobile tab bar.
import { $, $$, html, raw, esc, money, icon, stars, toast, lockScroll, trapFocus, debounce, initReveal } from './ui.js';
import { Store } from './store.js';
import { api } from './api.js';
import { bindCards, syncCards } from './card.js';
import { mountCtas, initAccordions } from './sections.js';

const isDesktop = () => window.matchMedia('(min-width: 990px)').matches;

// ---------------------------------------------------------------- announcement
function initAnnouncement() {
  const bar = $('[data-announcement]');
  if (!bar) return;
  const items = Store.site.announcements || [];
  const markup = items.map((t) => `<span class="announcement__item">${esc(t)}</span>`).join('');
  $$('[data-announcement-track]', bar).forEach((t) => { t.innerHTML = markup + markup; });
  let hidden = false;
  try { hidden = sessionStorage.getItem('drinkit.ann') === '1'; } catch { /* ignore */ }
  if (hidden) bar.classList.add('is-hidden');
  $('[data-announcement-close]', bar)?.addEventListener('click', () => {
    bar.classList.add('is-hidden');
    try { sessionStorage.setItem('drinkit.ann', '1'); } catch { /* ignore */ }
    measureHeader();
  });
}

// ---------------------------------------------------------------- sticky header
let header, spacer, baseBottom = 0, baseSpace = 0, stuck = false;
function measureHeader() {
  if (!header || stuck) return;
  const r = header.getBoundingClientRect();
  baseBottom = r.bottom + window.scrollY;
  baseSpace = header.offsetHeight + parseFloat(getComputedStyle(header).marginTop || '0');
}
function initStickyHeader() {
  header = $('[data-site-header]');
  spacer = $('[data-header-spacer]');
  if (!header) return;
  measureHeader();
  window.addEventListener('resize', debounce(() => { measureHeader(); window.dispatchEvent(new Event('scroll')); }, 150));
  window.addEventListener('load', measureHeader);
  let ticking = false;
  const update = () => {
    ticking = false;
    // below the desktop breakpoint the header is plain CSS-sticky, never "stuck"
    const want = isDesktop() && window.scrollY > baseBottom + 30;
    if (want === stuck) return;
    if (want) {
      const inFlow = getComputedStyle(header).position !== 'absolute' && isDesktop();
      if (inFlow && spacer) { spacer.style.height = baseSpace + 'px'; spacer.classList.add('is-on'); }
      header.classList.add('is-stuck');
      stuck = true;
    } else {
      header.classList.remove('is-stuck');
      spacer?.classList.remove('is-on');
      stuck = false;
      requestAnimationFrame(measureHeader);
    }
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();

  // keyboard / touch support for mega menus
  $$('.menu > li').forEach((li) => {
    const link = $('.menu__link[aria-haspopup]', li);
    if (!link) return;
    link.addEventListener('click', (e) => {
      if (window.matchMedia('(hover: none)').matches && isDesktop()) {
        if (!li.classList.contains('is-open')) { e.preventDefault(); $$('.menu > li.is-open').forEach((o) => o.classList.remove('is-open')); li.classList.add('is-open'); }
      }
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) $$('.menu > li.is-open').forEach((o) => o.classList.remove('is-open')); });
}

// ---------------------------------------------------------------- mega menu content
function fillMenus() {
  const cols = Store.collections;
  $$('[data-menu-collections]').forEach((ul) => { ul.innerHTML = String(html`${cols.map((c) => raw(`<li><a href="/collections/${c.handle}">${esc(c.title)}</a></li>`))}<li><a href="/collections/all">All cans</a></li>`); });
  const brands = Store.brands().slice(0, 9);
  $$('[data-menu-brands]').forEach((ul) => { ul.innerHTML = brands.map((b) => `<li><a href="/collections/all?brand=${esc(b.handle)}">${esc(b.name)}</a></li>`).join(''); });
  const best = [...Store.products].sort((a, b) => b.sold - a.sold);
  const lists = {
    best: best.slice(0, 5),
    new: [...Store.products].filter((p) => p.badges.includes('new')).slice(0, 5),
    energy: Store.products.filter((p) => p.collections.includes('energy-rush') || p.collections.includes('zero-sugar')).slice(0, 5),
  };
  $$('[data-menu-list]').forEach((ul) => { ul.innerHTML = (lists[ul.dataset.menuList] || []).map((p) => `<li><a href="/products/${esc(p.handle)}">${esc(p.title)}</a></li>`).join(''); });
  const feats = [best[0], best[1], lists.new[0] || best[2], best.find((p) => p.origin === 'Imported') || best[3]];
  $$('[data-menu-feature]').forEach((el) => {
    const p = feats[Number(el.dataset.menuFeature)];
    if (!p) { el.remove(); return; }
    el.outerHTML = `<a class="menu-feature" href="/products/${esc(p.handle)}"><div class="menu-feature__media" style="--tile:${esc(p.tile)}"><img src="${esc(p.images.card)}" alt="${esc(p.title)}" loading="lazy"></div><h4>${esc(p.title)}</h4><span class="price">${money(p.price)}${p.compareAt > p.price ? `<s>${money(p.compareAt)}</s>` : ''}</span></a>`;
  });
}

// ---------------------------------------------------------------- drawers
const drawers = {};
function makeDrawer(id, { side = 'right', label, cls = '', content }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.dataset.overlayFor = id;
  const el = document.createElement('aside');
  el.className = `drawer ${side === 'left' ? 'drawer--left' : ''} ${cls}`;
  el.id = id;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', label);
  el.innerHTML = String(content);
  document.body.append(overlay, el);
  let lastFocus = null;
  const api_ = {
    el, overlay,
    open() {
      Object.values(drawers).forEach((d) => d !== api_ && d.close());
      lastFocus = document.activeElement;
      overlay.classList.add('is-open'); el.classList.add('is-open'); lockScroll(true);
      el.querySelector('input, button, a')?.focus({ preventScroll: true });
    },
    close() {
      if (!el.classList.contains('is-open')) return;
      overlay.classList.remove('is-open'); el.classList.remove('is-open'); lockScroll(false);
      lastFocus?.focus?.({ preventScroll: true });
    },
    get isOpen() { return el.classList.contains('is-open'); },
  };
  overlay.addEventListener('click', () => api_.close());
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') api_.close(); else trapFocus(el, e); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api_.close(); });
  drawers[id] = api_;
  return api_;
}

// ----- cart drawer -----
function cartLineHtml(l) {
  const { product: p, pack, qty } = l;
  return html`<li class="cline" data-handle="${p.handle}" data-pack="${pack.id}">
    <a class="cline__img" href="/products/${p.handle}" style="--tile:${p.tile}"><img src="${pack.id === 'single' ? p.images.thumb : p.images[pack.id] || p.images.thumb}" alt="${p.title}" width="80" height="80"></a>
    <div class="cline__body">
      <a class="cline__title" href="/products/${p.handle}">${p.title}</a>
      <div class="cline__pack">${pack.label}${pack.qty > 1 ? ` · ${pack.qty} cans` : ''}</div>
      <div class="cline__row">
        <div class="qty qty--sm"><button type="button" data-dec aria-label="Decrease quantity">${icon('minus')}</button><input type="text" inputmode="numeric" value="${qty}" aria-label="Quantity" data-qty><button type="button" data-inc aria-label="Increase quantity">${icon('plus')}</button></div>
        <b class="cline__total">${money(l.total)}</b>
      </div>
    </div>
    <button class="icon-btn cline__rm" type="button" data-remove aria-label="Remove ${p.title}">${icon('trash')}</button>
  </li>`;
}

export function freeDeliveryHtml(subtotal) {
  const free = Store.site.delivery.freeOver;
  const left = Math.max(0, free - subtotal);
  const pct = Math.min(100, Math.round((subtotal / free) * 100));
  return html`<div class="freebar"><p>${left > 0 ? raw(`Add <b>${money(left)}</b> more for <b>free delivery</b>`) : raw('🎉 You’ve unlocked <b>free delivery</b>!')}</p><div class="freebar__track"><span style="width:${pct}%"></span></div></div>`;
}

function renderCart() {
  const d = drawers['cart-drawer'];
  if (!d) return;
  const lines = Store.cartLines();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const sub = lines.reduce((s, l) => s + l.total, 0);
  $('[data-cart-title]', d.el).textContent = `Your cart${count ? ` (${count})` : ''}`;
  const body = $('[data-cart-body]', d.el);
  const foot = $('[data-cart-foot]', d.el);
  if (!lines.length) {
    body.innerHTML = String(html`<div class="cart-empty"><img src="${Store.products[0]?.images.card}" alt="" width="120"><h3>Your cart is empty</h3><p>Grab a few ice-cold cans and they’ll show up here.</p><a class="btn" href="/collections/all" data-close>Start shopping</a></div>`);
    foot.hidden = true;
    return;
  }
  foot.hidden = false;
  body.innerHTML = String(html`<ul class="clines">${lines.map(cartLineHtml)}</ul>`);
  $('[data-cart-free]', d.el).innerHTML = String(freeDeliveryHtml(sub));
  $('[data-cart-sub]', d.el).textContent = money(sub);
}

function initCartDrawer() {
  const d = makeDrawer('cart-drawer', {
    label: 'Shopping cart',
    cls: 'cart-drawer',
    content: html`<div class="drawer__head"><h2 data-cart-title>Your cart</h2><button class="icon-btn" type="button" data-close aria-label="Close cart">${icon('close')}</button></div>
      <div class="drawer__body" data-cart-body></div>
      <div class="drawer__foot" data-cart-foot hidden>
        <div data-cart-free></div>
        <div class="cart-sub"><span>Subtotal</span><b data-cart-sub>৳0</b></div>
        <p class="cart-note">Delivery and coupons are calculated at checkout.</p>
        <div class="cart-actions"><a class="btn btn--block" href="/checkout">Checkout</a><a class="btn btn--lime btn--block" href="/cart">View cart</a></div>
      </div>`,
  });
  d.el.addEventListener('click', (e) => {
    const li = e.target.closest('.cline');
    if (!li) return;
    const { handle, pack } = li.dataset;
    const cur = Store.cartItems().find((i) => i.handle === handle && i.pack === pack);
    if (e.target.closest('[data-inc]')) Store.setQty(handle, pack, (cur?.qty || 1) + 1);
    else if (e.target.closest('[data-dec]')) { if ((cur?.qty || 1) > 1) Store.setQty(handle, pack, cur.qty - 1); else Store.removeFromCart(handle, pack); }
    else if (e.target.closest('[data-remove]')) Store.removeFromCart(handle, pack);
  });
  d.el.addEventListener('change', (e) => {
    const input = e.target.closest('[data-qty]');
    if (!input) return;
    const li = input.closest('.cline');
    const n = parseInt(input.value, 10);
    if (n >= 1) Store.setQty(li.dataset.handle, li.dataset.pack, n); else renderCart();
  });
  renderCart();
  Store.on('cart', () => { renderCart(); updateCounts(); });
  Store.on('cart:added', () => { renderCart(); d.open(); });
  return d;
}

// ----- mobile menu -----
function initMobileMenu() {
  const cols = Store.collections;
  const brands = Store.brands().slice(0, 9);
  const d = makeDrawer('menu-drawer', {
    side: 'left',
    label: 'Menu',
    cls: 'mobile-menu',
    content: html`<div class="drawer__head"><a class="logo" href="/"><img src="/assets/img/shapes/logo.svg" alt="Drink it" height="40" width="116"></a><button class="icon-btn" type="button" data-close aria-label="Close menu">${icon('close')}</button></div>
      <div class="drawer__body"><nav aria-label="Mobile"><ul>
        <li><details><summary>Home ${icon('chev-down')}</summary><ul><li><a href="/">Home – Default</a></li><li><a href="/home-2">Home V2</a></li></ul></details></li>
        <li><a href="/collections">Collections</a></li>
        <li><details><summary>Shop ${icon('chev-down')}</summary><ul>${cols.map((c) => raw(`<li><a href="/collections/${c.handle}">${esc(c.title)}</a></li>`))}<li><a href="/collections/all">All cans</a></li></ul></details></li>
        <li><details><summary>Brands ${icon('chev-down')}</summary><ul>${brands.map((b) => raw(`<li><a href="/collections/all?brand=${esc(b.handle)}">${esc(b.name)}</a></li>`))}</ul></details></li>
        <li><details><summary>Pages ${icon('chev-down')}</summary><ul><li><a href="/pages/about-us">About Us</a></li><li><a href="/pages/faq">FAQ’s</a></li><li><a href="/pages/our-locations">Delivery Areas</a></li><li><a href="/track">Track Order</a></li><li><a href="/pages/contact">Contact us</a></li></ul></details></li>
        <li><a href="/blogs/news">Blog</a></li>
      </ul></nav></div>
      <div class="drawer__foot mobile-menu__foot"><a class="btn btn--block" href="/account">My account</a><a class="btn btn--lime btn--block" href="/track">Track order</a></div>`,
  });
  return d;
}

// ----- search -----
function initSearch() {
  const modal = document.createElement('div');
  modal.className = 'modal search-modal';
  modal.id = 'search-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Search');
  modal.innerHTML = String(html`<div class="modal__backdrop" data-close></div>
    <div class="search-modal__panel">
      <form class="search-form" role="search" action="/search" method="get">
        ${icon('search')}
        <input type="search" name="q" placeholder="Search for cans, brands, flavours…" autocomplete="off" aria-label="Search the store" data-search-input>
        <button type="button" class="icon-btn" data-close aria-label="Close search">${icon('close')}</button>
      </form>
      <div class="search-results" data-search-results></div>
    </div>`);
  document.body.append(modal);
  const input = $('[data-search-input]', modal);
  const results = $('[data-search-results]', modal);
  let last = null;

  const miniHtml = (p) => html`<a class="sres" href="/products/${p.handle}"><span class="sres__img" style="--tile:${p.tile}"><img src="${p.images.thumb}" alt="" loading="lazy" width="60" height="60"></span><span class="sres__body"><b>${p.title}</b><small>${p.brand} · ${p.canMl} ml</small></span><span class="price">${money(p.price)}</span></a>`;

  const render = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      const rec = Store.recent().map((h) => Store.get(h)).filter(Boolean).slice(0, 5);
      results.innerHTML = String(html`<div class="sres__chips"><span>Popular:</span>${['Coca-Cola', 'Pepsi', 'Sprite', 'Mojo', 'Energy', 'Zero sugar', 'Imported'].map((t) => raw(`<a class="pill pill--btn" href="/search?q=${encodeURIComponent(t)}">${esc(t)}</a>`))}</div>
        ${rec.length ? html`<div class="sres__head"><h3>Recently viewed</h3><button type="button" class="link-btn" data-clear-recent>Clear</button></div><div class="sres__list">${rec.map(miniHtml)}</div>` : ''}`);
      return;
    }
    const terms = q.split(/\s+/);
    const hits = Store.products.filter((p) => {
      const hay = `${p.title} ${p.brand} ${p.variant} ${p.type} ${p.origin} ${p.sugar === 'Zero' ? 'zero sugar sugarfree' : ''} ${p.collections.join(' ')} ${p.canMl}ml`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }).slice(0, 6);
    results.innerHTML = hits.length
      ? String(html`<div class="sres__list">${hits.map(miniHtml)}</div><a class="btn btn--block sres__all" href="/search?q=${encodeURIComponent(input.value.trim())}">See all results</a>`)
      : String(html`<p class="sres__none">No cans match “${input.value.trim()}”. Try a brand like “Coca-Cola” or a flavour like “orange”.</p>`);
  };
  input.addEventListener('input', debounce(render, 120));
  results.addEventListener('click', (e) => { if (e.target.closest('[data-clear-recent]')) { Store.clearRecent(); render(); } });
  const api_ = {
    open() { drawers['cart-drawer']?.close(); drawers['menu-drawer']?.close(); modal.classList.add('is-open'); lockScroll(true); render(); setTimeout(() => input.focus(), 50); },
    close() { modal.classList.remove('is-open'); lockScroll(false); },
  };
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api_.close(); });
  modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') api_.close(); else trapFocus(modal, e); });
  return api_;
}

// ---------------------------------------------------------------- counts + tab bar
function updateCounts() {
  const cart = Store.cartCount();
  $$('[data-cart-count]').forEach((el) => { el.textContent = cart ? String(cart) : ''; });
  const w = Store.wishlist().length;
  $$('[data-wishlist-count]').forEach((el) => { el.textContent = w ? String(w) : ''; });
}
function initTabbar() {
  const p = location.pathname;
  const key = p === '/' || p === '/home-2' ? 'home' : p.startsWith('/collections') || p.startsWith('/products') ? 'collections' : p.startsWith('/account') ? 'account' : p.startsWith('/wishlist') ? 'wishlist' : p.startsWith('/cart') ? 'cart' : '';
  $(`[data-tab="${key}"]`)?.classList.add('is-current');
}

// ---------------------------------------------------------------- newsletter (footer + popup)
async function subscribe(form, msgEl) {
  const email = form.querySelector('input[type=email]').value.trim();
  msgEl.textContent = '';
  try {
    const r = await api('/newsletter', { method: 'POST', body: { email } });
    msgEl.textContent = r.message;
    form.reset();
    try { localStorage.setItem('drinkit.nl', 'done'); } catch { /* ignore */ }
    return r;
  } catch (err) {
    msgEl.textContent = err.fields?.email || err.message;
    return null;
  }
}
function initNewsletter() {
  $$('[data-newsletter]').forEach((form) => {
    form.addEventListener('submit', (e) => { e.preventDefault(); subscribe(form, $('[data-newsletter-msg]') || form.nextElementSibling); });
  });
}

function initPopup() {
  let seen = false;
  try { seen = localStorage.getItem('drinkit.nl') === 'done' || sessionStorage.getItem('drinkit.popup') === '1'; } catch { /* ignore */ }
  if (seen || /^\/(checkout|admin|cart|orders)/.test(location.pathname)) return;
  setTimeout(() => {
    if ($('.modal.is-open') || $('.drawer.is-open')) return;
    const modal = document.createElement('div');
    modal.className = 'modal nl-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Join the Drink it club');
    modal.innerHTML = String(html`<div class="modal__backdrop" data-close></div>
      <div class="modal__panel nl-modal__panel">
        <button class="icon-btn modal__close" type="button" data-close aria-label="Close">${icon('close')}</button>
        <div class="nl-modal__form">
          <h2>Sign up and save</h2>
          <p>Join the Drink it club for restock alerts and get <b>৳50 off</b> your first order over ৳400.</p>
          <form data-popup-form novalidate>
            <input class="input" type="email" name="email" placeholder="Your Email" autocomplete="email" required aria-label="Your email">
            <button class="btn btn--block" type="submit">Subscribe</button>
          </form>
          <p class="nl-modal__msg" data-popup-msg aria-live="polite"></p>
        </div>
        <div class="nl-modal__art"><img src="/assets/img/scenes/hero-2.webp" alt="" loading="lazy"></div>
      </div>`);
    document.body.append(modal);
    requestAnimationFrame(() => modal.classList.add('is-open'));
    lockScroll(true);
    try { sessionStorage.setItem('drinkit.popup', '1'); } catch { /* ignore */ }
    const close = () => { modal.classList.remove('is-open'); lockScroll(false); setTimeout(() => modal.remove(), 350); };
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); else trapFocus(modal, e); });
    $('input', modal).focus();
    $('[data-popup-form]', modal).addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await subscribe(e.target, $('[data-popup-msg]', modal));
      if (r) setTimeout(close, 3200);
    });
  }, 14000);
}

// ---------------------------------------------------------------- real-order activity toast
async function initActivity() {
  if (/^\/(checkout|admin|cart)/.test(location.pathname)) return;
  setTimeout(async () => {
    try {
      const { activity } = await api('/activity');
      if (!activity.length || sessionStorage.getItem('drinkit.act') === '1') return;
      sessionStorage.setItem('drinkit.act', '1');
      const a = activity[Math.floor(Math.random() * activity.length)];
      const el = document.createElement('a');
      el.className = 'activity';
      el.href = `/products/${a.handle}`;
      el.innerHTML = String(html`<span class="activity__img" style="--tile:${a.tile}"><img src="${a.image}" alt="" width="64" height="64"></span><span><small>Recently ordered</small><b>${a.title}</b><em>In ${a.place} · ${a.minutesAgo < 60 ? `${a.minutesAgo} min ago` : `${Math.round(a.minutesAgo / 60)} hr ago`}</em></span><button type="button" aria-label="Dismiss">${icon('close')}</button>`);
      el.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); el.remove(); });
      document.body.append(el);
      setTimeout(() => el.remove(), 7000);
    } catch { /* optional */ }
  }, 22000);
}

function initScrollTop() {
  const btn = $('[data-scroll-top]');
  if (!btn) return;
  const onScroll = () => btn.classList.toggle('is-on', window.scrollY > 500);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ---------------------------------------------------------------- boot
export function initChrome() {
  initAnnouncement();
  initStickyHeader();
  fillMenus();
  bindCards();
  const cart = initCartDrawer();
  const menu = initMobileMenu();
  const search = initSearch();
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open]');
    if (!t) return;
    e.preventDefault();
    const what = t.dataset.open;
    if (what === 'cart') cart.open();
    else if (what === 'menu') menu.open();
    else if (what === 'search') search.open();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); search.open(); }
  });
  updateCounts();
  Store.on('wish', updateCounts);
  initTabbar();
  initNewsletter();
  initScrollTop();
  mountCtas();
  initAccordions();
  initReveal();
  syncCards();
  initPopup();
  initActivity();
  return { cart, menu, search };
}
