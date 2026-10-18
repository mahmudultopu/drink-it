// Home page (layout 1): hero slider, collection rows with hover-can, product grids, featured can,
// pop-art strips, reviews marquee and blog cards.
import { $, $$, html, money, stars, icon, initReveal, startCountdowns } from '../ui.js';
import { Store } from '../store.js';
import { renderGrid } from '../card.js';
import { initHero } from '../slider.js';
import { blogCard } from '../blog-card.js';

const PICK_HANDLES = [
  'sprite-250ml-can',
  'fanta-orange-250ml-can',
  'clemon-mojito-250ml-can',
  'coca-cola-original-250ml-can',
  'mojo-cola-250ml-can',
  'pepsi-250ml-can',
  'speed-energy-drink-250ml-can',
  'red-bull-sugarfree-250ml-can',
];

const FEATURED = [
  {
    handle: 'coca-cola-original-250ml-can',
    eyebrow: 'Ice-Cold Classic',
    title: 'Coca-Cola—Pure Cola Fizz',
    temp: '4–6 °C',
    color: 'Ruby Red',
    cal: '≈ 42 kcal / 100 ml',
    flavor: 'Classic Cola',
  },
  {
    handle: 'sprite-250ml-can',
    eyebrow: 'Crisp & Clear',
    title: 'Sprite—Lemon-Lime Sparkle',
    temp: '3–5 °C',
    color: 'Crystal Clear',
    cal: '≈ 40 kcal / 100 ml',
    flavor: 'Lemon-Lime',
  },
  {
    handle: 'mountain-dew-250ml-can',
    eyebrow: 'Citrus Kick',
    title: 'Mountain Dew—Bold Citrus',
    temp: '3–5 °C',
    color: 'Vivid Lime Green',
    cal: '≈ 46 kcal / 100 ml',
    flavor: 'Citrus Punch',
  },
];

export const REVIEWS = [
  {
    name: 'Tanvir Hasan',
    place: 'Dhanmondi, Dhaka',
    handle: 'coca-cola-original-250ml-can',
    rating: 5,
    text: 'Ordered a carton of 24 for my brother’s birthday. Every can arrived sealed and ice-cold after an hour in the fridge.',
  },
  {
    name: 'Nusrat Jahan',
    place: 'Chattogram',
    handle: 'sprite-250ml-can',
    rating: 5,
    text: 'Finally a place that has Sprite, Clemon and Mojo together. Delivery to Chattogram took three days, no dents at all.',
  },
  {
    name: 'Rafiq Ahmed',
    place: 'Uttara, Dhaka',
    handle: 'speed-energy-drink-250ml-can',
    rating: 4,
    text: 'Great price on the 12-pack of Speed. Paid with bKash, got a confirmation call within minutes.',
  },
  {
    name: 'Sadia Islam',
    place: 'Sylhet',
    handle: 'fanta-orange-250ml-can',
    rating: 5,
    text: 'Our office fridge is always stocked from Drink it now. The carton discount actually makes it cheaper than the shop.',
  },
  {
    name: 'Imran Hossain',
    place: 'Mirpur, Dhaka',
    handle: 'mojo-cola-250ml-can',
    rating: 5,
    text: 'Mojo cartons delivered in one day. Packaging was solid and the price was exactly what the site showed.',
  },
  {
    name: 'Farzana Akter',
    place: 'Rajshahi',
    handle: 'clemon-mojito-250ml-can',
    rating: 4,
    text: 'Tried the Clemon Mojito on a friend’s tip. So refreshing! Will order the 6-pack next time.',
  },
];

function collectionRows() {
  const rows = $('[data-collection-rows]');
  if (!rows) return;
  rows.innerHTML = String(
    html`${Store.collections.map((c) => {
      const lead = Store.get(c.lead);
      const inCol = Store.products.filter((p) => p.collections.includes(c.handle));
      const minPrice = Math.min(...inCol.map((p) => p.price));
      const minMl = Math.min(...inCol.map((p) => p.canMl));
      return html`<a class="crow" href="/collections/${c.handle}" data-can="${lead?.images.angle}">
      ${lead ? html`<img class="crow__img" src="${lead.images.single}" alt="" loading="lazy">` : ''}
      <span class="crow__title">${c.title}</span>
      <span class="crow__spec"><span>Min Size:</span><b>${minMl} ml</b></span>
      <span class="crow__spec crow__spec--end"><span>Start at:</span><b>${money(minPrice)}</b></span>
    </a>`;
    })}`,
  );

  // floating tilted can that follows the cursor (desktop only)
  if (!window.matchMedia('(hover: hover) and (min-width: 990px)').matches) return;
  const img = document.createElement('img');
  img.className = 'hover-can';
  img.alt = '';
  document.body.append(img);
  let tx = 0,
    ty = 0,
    x = 0,
    y = 0,
    raf = 0;
  const loop = () => {
    x += (tx - x) * 0.14;
    y += (ty - y) * 0.14;
    img.style.transform = `translate(${x - 95}px, ${y - 190}px) rotate(14deg)`;
    raf = requestAnimationFrame(loop);
  };
  rows.addEventListener('mousemove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
  });
  rows.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.crow');
    if (!row) return;
    if (img.src !== row.dataset.can) img.src = row.dataset.can;
    img.classList.add('is-on');
    if (!raf) {
      x = tx;
      y = ty;
      raf = requestAnimationFrame(loop);
    }
  });
  rows.addEventListener('mouseleave', () => {
    img.classList.remove('is-on');
    cancelAnimationFrame(raf);
    raf = 0;
  });
}

export function featured() {
  const root = $('[data-featured]');
  if (!root) return;
  const items = FEATURED.map((f) => ({ ...f, product: Store.get(f.handle) })).filter((f) => f.product);
  if (!items.length) {
    root.remove();
    return;
  }
  let i = 0;
  const set = (key, text) => {
    const el = $(`[data-feat="${key}"]`, root);
    if (el) el.textContent = text;
  };
  const show = (n, animate = true) => {
    i = (n + items.length) % items.length;
    const f = items[i];
    const img = $('[data-feat="image"]', root);
    const apply = () => {
      set('eyebrow', f.eyebrow);
      set('title', f.title);
      set('temp', f.temp);
      set('color', f.color);
      set('cal', f.cal);
      set('flavor', f.flavor);
      set('count', `${String(i + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`);
      set('name', f.product.title);
      img.src = f.product.images.single;
      img.alt = f.product.title;
      $('[data-feat="link"]', root).href = `/products/${f.product.handle}`;
      img.classList.remove('is-swap');
    };
    if (animate) {
      img.classList.add('is-swap');
      setTimeout(apply, 280);
    } else apply();
  };
  $('[data-feat-prev]', root).addEventListener('click', () => show(i - 1));
  $('[data-feat-next]', root).addEventListener('click', () => show(i + 1));
  show(0, false);
}

export function strips() {
  const box = $('[data-strips-box]');
  const bars = $('[data-strips-bars]');
  if (!box) return;
  const build = () => {
    const w = box.clientWidth;
    const n = Math.ceil((w + 13) / 52);
    bars.innerHTML = Array.from(
      { length: n },
      (_, k) => `<span class="strips__bar" style="--x:${-k * 52}px"></span>`,
    ).join('');
    box.style.setProperty('--box-w', Math.max(w + 200, 1400) + 'px');
  };
  build();
  let t;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(build, 120);
  }).observe(box);
  const btn = $('[data-strips-toggle]');
  btn.addEventListener('click', () => {
    const paused = box.classList.toggle('is-paused');
    btn.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  });
}

function reviews() {
  const el = $('[data-reviews]');
  if (!el) return;
  const cards = REVIEWS.map((r) => ({ ...r, product: Store.get(r.handle) })).filter((r) => r.product);
  const card = (r) => html`<article class="reel">
    <div class="reel__tile" style="--tile:${r.product.tile}">
      <img src="${r.product.images.card}" alt="${r.product.title}" loading="lazy">
      <span class="reel__badge" aria-hidden="true">${icon('check')}</span>
      <p class="reel__quote">“${r.text}”</p>
    </div>
    <div class="reel__meta"><div><strong>${r.name}</strong><em>${r.product.title} · ${r.place}</em></div>${stars(r.rating, 'stars--sm')}</div>
  </article>`;
  const set = html`<div class="reels__track">${cards.map(card)}</div>`;
  el.innerHTML = String(set) + String(set);
}

function blog() {
  const grid = $('[data-blog-grid]');
  if (!grid) return;
  grid.innerHTML = String(html`${Store.posts.slice(0, 3).map((p) => blogCard(p))}`);
}

export async function init() {
  initHero();
  collectionRows();
  const picks = PICK_HANDLES.map((h) => Store.get(h)).filter(Boolean);
  const rest = [...Store.products].sort((a, b) => b.sold - a.sold).filter((p) => !picks.includes(p));
  renderGrid($('[data-grid="picks"]'), picks.length >= 4 ? picks.slice(0, 8) : Store.products.slice(0, 8));
  renderGrid($('[data-grid="top"]'), rest.slice(0, 8));
  featured();
  strips();
  reviews();
  blog();
  // hero cans (arch)
  $$('[data-hero-can]').forEach((img) => {
    const p = Store.get(img.dataset.heroCan);
    if (p) img.src = p.images.single;
  });
  startCountdowns();
  initReveal();
}
