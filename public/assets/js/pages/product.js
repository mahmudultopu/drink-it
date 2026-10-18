// Product page: gallery, pack selector, delivery estimate, buy box, details, reviews, recommendations.
import {
  $,
  $$,
  html,
  raw,
  esc,
  money,
  icon,
  stars,
  toast,
  discountPct,
  fmtDate,
  startCountdowns,
  initReveal,
  countdownHtml,
} from '../ui.js';
import { Store } from '../store.js';
import { api } from '../api.js';
import { productCard } from '../card.js';
import { crumbs } from '../sections.js';
import { initTrack } from '../slider.js';

const ord = (n) =>
  n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const short = (d) => `${ord(d.getUTCDate())} ${MONTH[d.getUTCMonth()]}`;
const range = (a, b) =>
  a.getTime() === b.getTime() ? short(a) : `${ord(a.getUTCDate())}–${ord(b.getUTCDate())} ${MONTH[b.getUTCMonth()]}`;
const isFriday = (d) => d.getUTCDay() === 5; // weekly holiday in Bangladesh
function nextWorkday(d) {
  const r = new Date(d);
  while (isFriday(r)) r.setUTCDate(r.getUTCDate() + 1);
  return r;
}
function addWorkdays(d, n) {
  const r = new Date(d);
  while (n > 0) {
    r.setUTCDate(r.getUTCDate() + 1);
    if (!isFriday(r)) n--;
  }
  return r;
}

function estimate(site, zone) {
  const now = new Date(Date.now() + 6 * 3600_000); // Bangladesh time
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const after = now.getUTCHours() >= site.delivery.cutoffHour;
  const start = nextWorkday(after ? new Date(today.getTime() + 864e5) : today);
  const shipEnd = addWorkdays(start, 1);
  const [minD, maxD] = zone === 'dhaka' ? site.delivery.etaDhaka : site.delivery.etaOutside;
  return { today, start, shipEnd, from: addWorkdays(start, minD), to: addWorkdays(start, maxD), after };
}

const GALLERY = [
  ['single', 'Front view'],
  ['angle', 'Angled view'],
  ['pack6', '6-pack'],
  ['pack12', '12-pack'],
  ['pack24', 'Carton of 24'],
];

export async function init() {
  const handle = decodeURIComponent(location.pathname.split('/')[2] || '');
  const root = $('[data-product-root]');
  const base = Store.get(handle);
  if (!base) {
    root.innerHTML =
      '<div class="empty"><h3>We couldn’t find that can</h3><a class="btn" href="/collections/all">Browse all cans</a></div>';
    document.title = 'Not found – Drink it';
    return;
  }
  let p = base,
    revs = { reviews: [], stats: { rating: 0, reviewCount: 0, dist: [0, 0, 0, 0, 0] } };
  try {
    const [d, r] = await Promise.all([
      api('/products/' + handle),
      api('/reviews?product=' + encodeURIComponent(handle)),
    ]);
    p = d;
    revs = r;
  } catch (e) {
    console.warn(e);
  }
  Store.pushRecent(handle);
  document.documentElement.style.setProperty('--page-bg', p.tile);
  document.title = `${p.title} – Drink it`;

  const site = Store.site;
  const col = Store.collections.find((c) => p.collections.includes(c.handle));
  const state = { pack: 'single', qty: 1, gallery: 0, zone: localStorage.getItem('drinkit.zone') || 'dhaka' };
  // each view has a full-size photo for the main stage and a small copy for its thumbnail button
  const thumbOf = (k) => p.images.small?.[k] || (k === 'single' ? p.images.thumb : p.images.card);
  const images = GALLERY.map(([k, label]) => ({ k, label, src: p.images[k], thumb: thumbOf(k) })).filter((i) => i.src);

  root.innerHTML = String(html`
<div class="pdp">
  ${crumbs([{ label: 'Home', href: '/' }, col ? { label: col.title, href: `/collections/${col.handle}` } : { label: 'All cans', href: '/collections/all' }, { label: p.title }])}
  <div class="pdp__grid">
    <div class="gallery" data-gallery>
      <div class="gallery__main">
        <div class="gallery__badges" data-badges></div>
        <button class="gallery__nav gallery__nav--prev" type="button" aria-label="Previous image" data-g-prev>${icon('arrow-left')}</button>
        <img data-g-main src="${images[0].src}" alt="${p.title}" width="640" height="620" fetchpriority="high">
        <button class="gallery__nav gallery__nav--next" type="button" aria-label="Next image" data-g-next>${icon('arrow-right')}</button>
      </div>
      <div class="gallery__thumbs" role="tablist">${images.map((im, i) => html`<button class="gallery__thumb${i === 0 ? ' is-active' : ''}" type="button" role="tab" data-g-thumb="${i}" aria-label="${im.label}"><img src="${im.thumb}" alt="" loading="lazy" width="84" height="84"></button>`)}</div>
    </div>

    <div class="pdp__info" data-info>
      <h1 class="pdp__title">${p.title}</h1>
      <div class="pdp__rating">${revs.stats.reviewCount ? html`${stars(revs.stats.rating, 'stars--lg')}<a href="#reviews">${revs.stats.rating.toFixed(1)} · ${revs.stats.reviewCount} review${revs.stats.reviewCount === 1 ? '' : 's'}</a>` : html`${stars(0, 'stars--lg')}<a href="#reviews">Be the first to review</a>`}</div>
      <div class="pdp__price" data-price></div>
      <p class="pdp__short">${p.short} <a href="#details">Read more</a></p>
      <hr>
      <div class="stock" data-stock></div>
      ${p.dealEndsAt ? html`<div style="margin-top:16px"><p class="eyebrow" style="margin-bottom:8px">Deal ends in</p>${countdownHtml(p.dealEndsAt, 'cd--lg')}</div>` : ''}
      <div class="packs" role="radiogroup" aria-label="Choose a pack size" data-packs>${p.packs.map(
        (
          pk,
        ) => html`<button class="pack${pk.id === 'single' ? ' is-active' : ''}" type="button" role="radio" aria-checked="${String(pk.id === 'single')}" data-pack="${pk.id}" ${pk.available ? '' : 'disabled'}>
        ${pk.qty > 1 && pk.compareAt > pk.price ? html`<span class="pack__save">Save ${discountPct(pk.price, pk.compareAt)}%</span>` : ''}
        <span class="pack__img" style="--tile:${p.tile}"><img src="${Store.packImage(p, pk.id)}" alt="" loading="lazy" width="70" height="70"></span>
        <span><b>${pk.label}</b><small>${pk.qty > 1 ? `${pk.qty} cans · ${money(Math.round((pk.price / pk.qty) * 10) / 10)}/can` : p.canMl + ' ml can'}</small><span class="price">${money(pk.price)}</span></span>
      </button>`,
      )}</div>
      <div class="pdp__buy">
        <div class="qty" data-qty-box><button type="button" data-dec aria-label="Decrease quantity">${icon('minus')}</button><input type="text" inputmode="numeric" value="1" aria-label="Quantity" data-qty><button type="button" data-inc aria-label="Increase quantity">${icon('plus')}</button></div>
        <button class="btn btn--lime pdp__buy-btn" type="button" data-add><span>Add to cart</span></button>
      </div>
      <button class="btn btn--block" type="button" data-buy><span>Buy it now</span></button>
      <div class="pdp__pickup">${icon('check')}<div><b>Delivered from our Dhaka store</b><span>Orders usually leave within 24 hours.</span></div></div>
      <a class="btn btn--whatsapp btn--block" data-wa target="_blank" rel="noopener">${icon('whatsapp')}<span>Order on WhatsApp</span></a>
      <div class="pdp__tools">
        <button class="tool-btn" type="button" data-wish>${icon('heart')}<span data-wish-label>Add to wishlist</span></button>
        <button class="tool-btn" type="button" data-compare>${icon('compare')}<span data-compare-label>Compare</span></button>
        <button class="tool-btn" type="button" data-share>${icon('share')}<span>Share</span></button>
      </div>
      <div class="timeline-card" data-timeline></div>
    </div>
  </div>
</div>

<section class="pdp-block" aria-label="Pairs well with">
  <h2>Pairs well with</h2>
  <div class="slider related" data-related>
    <div class="slider__track">${Store.related(p, 8).map((r) => productCard(r))}</div>
    <div class="slider__arrows"><button class="arrow-btn" type="button" data-prev aria-label="Previous">${icon('arrow-left')}</button><button class="arrow-btn" type="button" data-next aria-label="Next">${icon('arrow-right')}</button></div>
  </div>
</section>

<div class="meter on-dark" aria-label="Taste meter"><div class="meter__inner">${p.meter.map((m) => html`<div><b>${m.v}%</b><span>${m.k}</span></div>`)}</div></div>

<section class="pdp-desc" id="details">
  <div class="rte">
    ${p.long.map((t) => html`<p>${t}</p>`)}
    <h3>Why You’ll Love It:</h3>
    <ul>${p.why.map((w) => html`<li>${boldify(w)}</li>`)}</ul>
    <h3>Key Details:</h3>
    <ul>${p.details.map((d) => html`<li><strong>${d.k}:</strong> ${d.v}</li>`)}</ul>
  </div>
  <div class="taste">${p.taste.map((t) => html`<div class="taste__tile"><h3>${t.k}</h3><p>${t.v}</p></div>`)}</div>
</section>

<section class="reviews" id="reviews">
  <h2>Customer Reviews</h2>
  <div class="reviews__top">
    <div class="rsum">${stars(revs.stats.rating, 'stars--lg')}<b>${revs.stats.reviewCount ? revs.stats.rating.toFixed(2) : '–'}</b><span>${revs.stats.reviewCount ? `Based on ${revs.stats.reviewCount} review${revs.stats.reviewCount === 1 ? '' : 's'}` : 'No reviews yet'}</span></div>
    <div class="rbars">${[5, 4, 3, 2, 1].map((n) => {
      const c = revs.stats.dist[n - 1] || 0;
      const pct = revs.stats.reviewCount ? (c / revs.stats.reviewCount) * 100 : 0;
      return html`<div class="rbar"><span>${stars(n, 'stars--sm')}</span><i><span style="width:${pct}%"></span></i><span>${c}</span></div>`;
    })}</div>
    <button class="btn btn--sm" type="button" data-rform-toggle>Write a review</button>
  </div>
  <form class="rform" data-rform novalidate>
    <h3 style="font-size:26px">Write a review</h3>
    <div class="field"><span class="label">Your rating</span><div class="starpick" role="radiogroup" aria-label="Rating" data-starpick>${[1, 2, 3, 4, 5].map((n) => html`<button type="button" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}"><svg viewBox="0 0 24 24"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 3 1.1-6.1L3.2 9.6l6.1-.8z"/></svg></button>`)}</div><div class="field__error" data-err="rating"></div></div>
    <div class="field"><label for="rv-name">Name</label><input class="input" id="rv-name" name="name" autocomplete="name" maxlength="60"><div class="field__error" data-err="name"></div></div>
    <div class="field"><label for="rv-title">Review title <span class="muted">(optional)</span></label><input class="input" id="rv-title" name="title" maxlength="80"></div>
    <div class="field"><label for="rv-body">Review</label><textarea class="textarea" id="rv-body" name="body" maxlength="1000"></textarea><div class="field__error" data-err="body"></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="submit"><span>Submit review</span></button><button class="btn btn--ghost" type="button" data-rform-toggle>Cancel</button></div>
    <div class="form-note" data-rform-msg hidden></div>
  </form>
  <div class="rlist">${revs.reviews.map((r) => html`<article class="review"><div class="review__top">${stars(r.rating, 'stars--sm')}<span class="review__who"><i>${(r.name || '?')[0]}</i>${r.name}</span><time datetime="${r.createdAt}">${fmtDate(r.createdAt)}</time></div>${r.title ? html`<h3>${r.title}</h3>` : ''}<p>${r.body}</p></article>`)}</div>
</section>

<section class="sec sec--green-top" style="padding-top:70px">
  <div class="hills" role="presentation"></div>
  <div class="sec-green on-dark">
    <div class="sec-head"><p class="eyebrow">Don’t Miss Out</p><h2>Discover More Tasty Sips You’ll Love</h2></div>
    <div class="pgrid pgrid--green">${Store.products
      .filter((x) => x.handle !== p.handle)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 4)
      .map((x) => productCard(x))}</div>
    <a class="viewall" href="/collections/all">View All</a>
  </div>
</section>

<div data-recent></div>
<div data-cta></div>

<div class="stickybar" data-stickybar inert>
  <span class="stickybar__img" style="--tile:${p.tile}"><img src="${p.images.thumb}" alt="" width="54" height="54"></span>
  <div class="stickybar__info"><b>${p.title}</b><span class="price" data-sticky-price></span></div>
  <button class="btn" type="button" data-sticky-add><span>Add to cart</span></button>
  <button class="icon-btn stickybar__x" type="button" aria-label="Close" data-sticky-close>${icon('close')}</button>
</div>`);

  // ---------- behaviour ----------
  const q = (s) => $(s, root);
  const cur = () => Store.pack(p, state.pack);

  function renderBuy() {
    const pk = cur();
    const disc = discountPct(pk.price, pk.compareAt);
    q('[data-price]').innerHTML = String(
      html`<span class="price">${money(pk.price)}${pk.compareAt > pk.price ? raw(`<s>${money(pk.compareAt)}</s>`) : ''}</span>${disc ? html`<span class="badge">-${disc}%</span>` : ''}${pk.qty > 1 ? html`<small>${money(Math.round((pk.price / pk.qty) * 10) / 10)} per can</small>` : ''}`,
    );
    const out = p.stock <= 0 || !pk.available;
    const low = p.stock > 0 && p.stock < 30;
    q('[data-stock]').className = 'stock' + (out ? ' stock--out' : low ? ' stock--low' : '');
    q('[data-stock]').innerHTML = out
      ? '<i></i>Sold out'
      : low
        ? `<i></i>Only ${p.stock} cans left`
        : '<i></i>In stock';
    const max = Math.max(1, Store.maxQty(handle, pk.id));
    state.qty = Math.min(state.qty, max);
    q('[data-qty]').value = state.qty;
    const total = pk.price * state.qty;
    q('[data-add] span').textContent = out ? 'Sold out' : `Add to cart · ${money(total)}`;
    q('[data-add]').disabled = out;
    q('[data-buy]').disabled = out;
    q('[data-sticky-add]').disabled = out;
    q('[data-sticky-price]').innerHTML = String(
      html`${money(pk.price)}${pk.compareAt > pk.price ? raw(` <s>${money(pk.compareAt)}</s>`) : ''}`,
    );
    $$('.pack[data-pack]', root).forEach((b) => {
      const on = b.dataset.pack === pk.id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on);
    });
    const wa = `Hi Drink it! I'd like to order ${state.qty} × ${p.title} (${pk.label}) — ${money(total)}. Link: ${location.href}`;
    q('[data-wa]').href = `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(wa)}`;
    // badges
    const badges = [];
    if (p.stock <= 0) badges.push('Sold out');
    else if (disc) badges.push(`-${disc}%`);
    if (p.badges.includes('new') && p.stock > 0) badges.push('New');
    q('[data-badges]').innerHTML = badges
      .map((b) => `<span class="badge${b === 'New' ? ' badge--crimson' : ''}">${esc(b)}</span>`)
      .join('');
  }

  // gallery
  const main = q('[data-g-main]');
  function showImage(i, animate = true) {
    state.gallery = (i + images.length) % images.length;
    const im = images[state.gallery];
    const apply = () => {
      main.src = im.src;
      main.alt = `${p.title} — ${im.label}`;
      main.classList.toggle('is-wide', /^pack(12|24)$/.test(im.k));
      main.classList.remove('is-swap');
    };
    if (animate) {
      main.classList.add('is-swap');
      setTimeout(apply, 180);
    } else apply();
    $$('[data-g-thumb]', root).forEach((t, k) => t.classList.toggle('is-active', k === state.gallery));
  }
  q('[data-g-prev]').addEventListener('click', () => showImage(state.gallery - 1));
  q('[data-g-next]').addEventListener('click', () => showImage(state.gallery + 1));
  $$('[data-g-thumb]', root).forEach((t) => t.addEventListener('click', () => showImage(Number(t.dataset.gThumb))));
  let sx = 0;
  const gm = q('.gallery__main');
  gm.addEventListener(
    'touchstart',
    (e) => {
      sx = e.touches[0].clientX;
    },
    { passive: true },
  );
  gm.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 40) showImage(state.gallery + (dx < 0 ? 1 : -1));
  });

  // packs + quantity
  $$('[data-pack]', root).forEach((b) =>
    b.addEventListener('click', () => {
      state.pack = b.dataset.pack;
      const idx = images.findIndex((i) => i.k === state.pack);
      if (idx >= 0) showImage(idx);
      renderBuy();
    }),
  );
  const setQty = (n) => {
    const max = Math.max(1, Store.maxQty(handle, state.pack));
    state.qty = Math.max(1, Math.min(n, max));
    if (n > max) toast(`Only ${max} available in stock.`, { type: 'error' });
    renderBuy();
  };
  q('[data-inc]').addEventListener('click', () => setQty(state.qty + 1));
  q('[data-dec]').addEventListener('click', () => setQty(state.qty - 1));
  q('[data-qty]').addEventListener('change', (e) => setQty(parseInt(e.target.value, 10) || 1));
  q('[data-add]').addEventListener('click', () => Store.addToCart(handle, state.pack, state.qty));
  q('[data-buy]').addEventListener('click', () => {
    if (Store.addToCart(handle, state.pack, state.qty, { silent: true })) location.href = '/checkout';
  });
  q('[data-sticky-add]').addEventListener('click', () => Store.addToCart(handle, state.pack, state.qty));

  // wishlist / compare / share
  const syncTools = () => {
    const w = Store.inWishlist(handle),
      c = Store.compareList().includes(handle);
    q('[data-wish]').classList.toggle('is-active', w);
    q('[data-wish-label]').textContent = w ? 'In wishlist' : 'Add to wishlist';
    q('[data-compare]').classList.toggle('is-active', c);
    q('[data-compare-label]').textContent = c ? 'In compare' : 'Compare';
  };
  q('[data-wish]').addEventListener('click', () => {
    const a = Store.toggleWishlist(handle);
    toast(a ? 'Saved to your wishlist.' : 'Removed from wishlist.', a ? { href: '/wishlist', label: 'View' } : {});
    syncTools();
  });
  q('[data-compare]').addEventListener('click', () => {
    const r = Store.toggleCompare(handle);
    if (r === 'full') toast('You can compare up to 4 cans.', { type: 'error' });
    else
      toast(
        r === 'added' ? 'Added to compare.' : 'Removed from compare.',
        r === 'added' ? { href: '/compare', label: 'Compare' } : {},
      );
    syncTools();
  });
  q('[data-share]').addEventListener('click', async () => {
    const data = { title: p.title, text: `${p.title} on Drink it`, url: location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(location.href);
        toast('Link copied to clipboard.');
      }
    } catch {
      /* cancelled */
    }
  });
  syncTools();

  // delivery estimate
  function renderTimeline() {
    const e = estimate(site, state.zone);
    q('[data-timeline]').innerHTML =
      String(html`<div class="timeline-head"><h2>Delivery estimate</h2><select class="select" data-zone aria-label="Delivery area"><option value="dhaka" ${state.zone === 'dhaka' ? 'selected' : ''}>Dhaka city</option><option value="outside" ${state.zone === 'outside' ? 'selected' : ''}>Rest of Bangladesh</option></select></div>
      <div class="timeline">
        <div class="tstep"><span class="tstep__dot">${icon('cart')}</span><small>${short(e.today)}</small><span>Order Placed</span></div>
        <div class="tstep"><span class="tstep__dot">${icon('truck')}</span><small>${range(e.start, e.shipEnd)}</small><span>Order Shipped</span></div>
        <div class="tstep"><span class="tstep__dot">${icon('box')}</span><small>${range(e.from, e.to)}</small><span>Estimated Delivery</span></div>
      </div>
      <div class="tnotice">${icon('info')}<p>Order placed ${e.after ? 'after' : 'before'} ${site.delivery.cutoffHour}:00. Shipping starts <b>${short(e.start)}</b>. Expected delivery by <b>${MONTH_LONG[e.to.getUTCMonth()]} ${ord(e.to.getUTCDate())}</b>.</p></div>`);
    q('[data-zone]').addEventListener('change', (ev) => {
      state.zone = ev.target.value;
      try {
        localStorage.setItem('drinkit.zone', state.zone);
      } catch {
        /* ignore */
      }
      renderTimeline();
    });
  }
  renderTimeline();

  // reviews
  const form = q('[data-rform]');
  $$('[data-rform-toggle]', root).forEach((b) =>
    b.addEventListener('click', () => {
      form.classList.toggle('is-open');
      if (form.classList.contains('is-open')) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }),
  );
  let rating = 0;
  $$('[data-star]', root).forEach((b) =>
    b.addEventListener('click', () => {
      rating = Number(b.dataset.star);
      $$('[data-star]', root).forEach((s) => {
        s.classList.toggle('is-on', Number(s.dataset.star) <= rating);
        s.setAttribute('aria-checked', Number(s.dataset.star) === rating);
      });
    }),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $$('[data-err]', form).forEach((x) => {
      x.textContent = '';
    });
    const fd = new FormData(form);
    const btn = $('button[type=submit]', form);
    btn.classList.add('is-loading');
    try {
      const r = await api('/reviews', {
        method: 'POST',
        body: { product: handle, rating, name: fd.get('name'), title: fd.get('title'), body: fd.get('body') },
      });
      const note = q('[data-rform-msg]');
      note.hidden = false;
      note.className = 'form-note form-note--ok';
      note.textContent = r.message;
      form.reset();
      rating = 0;
      $$('[data-star]', root).forEach((s) => s.classList.remove('is-on'));
    } catch (err) {
      for (const [k, v] of Object.entries(err.fields || {})) {
        const el = $(`[data-err="${k}"]`, form);
        if (el) el.textContent = v;
      }
      if (!err.fields) toast(err.message, { type: 'error' });
    } finally {
      btn.classList.remove('is-loading');
    }
  });

  // sticky buy bar
  const bar = q('[data-stickybar]');
  let dismissed = false;
  const target = q('[data-add]');
  new IntersectionObserver(
    ([en]) => {
      const on = !en.isIntersecting && en.boundingClientRect.top < 0 && !dismissed;
      bar.classList.toggle('is-on', on);
      document.body.classList.toggle('has-stickybar', on);
      bar.inert = !on;
    },
    { threshold: 0 },
  ).observe(target);
  q('[data-sticky-close]').addEventListener('click', () => {
    dismissed = true;
    bar.classList.remove('is-on');
    bar.inert = true;
    document.body.classList.remove('has-stickybar');
  });

  // related slider + recently viewed
  initTrack(q('[data-related]'));
  const recent = Store.recent()
    .filter((h) => h !== handle)
    .map((h) => Store.get(h))
    .filter(Boolean)
    .slice(0, 4);
  if (recent.length) {
    q('[data-recent]').innerHTML = String(
      html`<section class="pdp-block"><h2>Recently viewed</h2><div class="pgrid pgrid--light">${recent.map((r) => productCard(r, { swatches: false }))}</div></section>`,
    );
  }

  // structured data for search engines
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: location.origin + p.images.single,
    description: p.short,
    brand: { '@type': 'Brand', name: p.brand },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BDT',
      price: p.price,
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: location.href,
    },
    ...(revs.stats.reviewCount
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: revs.stats.rating,
            reviewCount: revs.stats.reviewCount,
          },
        }
      : {}),
  });
  document.head.append(ld);

  renderBuy();
  Store.on('cart', renderBuy);
  startCountdowns();
  initReveal();
  if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 100);
}

function boldify(s) {
  // turn **bold** markers into <strong>, escaping everything else
  return raw(esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
}
