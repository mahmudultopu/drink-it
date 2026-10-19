// Home V2: oversized flavour name behind a floating can, soft/drink fan, features, reviews table.
import { $, $$, html, raw, esc, stars, initReveal, startCountdowns, sized, srcset } from '../ui.js';
import { Store } from '../store.js';
import { renderGrid } from '../card.js';
import { initHero } from '../slider.js';
import { featured, strips, REVIEWS } from './home.js';

// The three hero slides: the flavour name behind the can, a background wash, and the decorative floating pieces as
// [artwork, left %, top %, size px, parallax depth].
const SLIDES = [
  {
    title: 'Coca-Cola',
    handle: 'coca-cola-original-250ml-can',
    bg: 'linear-gradient(180deg,#f1e6d8 0%,#fbf3ea 55%,#fdfdf1 100%)',
    floats: [
      ['ice', 8, 22, 120, 0.04],
      ['bubble', 20, 64, 70, 0.07],
      ['ice', 84, 18, 100, 0.05],
      ['bubble', 88, 58, 90, 0.08],
      ['bubble', 74, 78, 54, 0.06],
      ['fruit-cherry', 14, 82, 90, 0.05],
      ['fruit-lemon', 92, 80, 110, 0.03],
    ],
  },
  {
    title: 'Lemon-Lime',
    handle: 'sprite-250ml-can',
    bg: 'linear-gradient(180deg,#e9edcf 0%,#f4f8e1 55%,#fdfdf1 100%)',
    floats: [
      ['fruit-lime', 9, 24, 130, 0.04],
      ['ice', 22, 70, 100, 0.06],
      ['fruit-lime', 86, 18, 96, 0.05],
      ['bubble', 90, 62, 80, 0.07],
      ['ice', 76, 80, 90, 0.04],
      ['bubble', 16, 50, 56, 0.08],
      ['fruit-lemon', 6, 86, 110, 0.03],
    ],
  },
  {
    title: 'Fanta Orange',
    handle: 'fanta-orange-250ml-can',
    bg: 'linear-gradient(180deg,#f6e3cf 0%,#fdf0e1 55%,#fdfdf1 100%)',
    floats: [
      ['fruit-orange', 8, 24, 130, 0.04],
      ['bubble', 24, 60, 64, 0.07],
      ['fruit-orange', 86, 20, 100, 0.05],
      ['ice', 88, 62, 100, 0.06],
      ['bubble', 72, 82, 60, 0.07],
      ['ice', 12, 84, 90, 0.04],
      ['fruit-mango', 94, 82, 90, 0.03],
    ],
  },
];

/** Build the hero slides and add the pointer parallax: the floating pieces drift a little as the mouse moves. */
function heroSlides() {
  const host = $('[data-hero2-slides]');
  host.innerHTML = String(
    html`${SLIDES.map((s, i) => {
      const p = Store.get(s.handle);
      if (!p) return '';
      return html`<article class="hero2__slide${i === 0 ? ' is-active' : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${SLIDES.length}" style="background:${s.bg}">
      ${i === 0 ? html`<h1 class="hero2__title">${s.title}</h1>` : html`<h2 class="hero2__title">${s.title}</h2>`}
      <img class="hero2__can" src="${p.images.single}" alt="${p.title}" ${i === 0 ? raw('fetchpriority="high"') : raw('loading="lazy"')}>
      ${s.floats.map(([n, x, y, w, d]) => raw(`<img class="hero2__float" data-depth="${d}" src="/assets/img/shapes/${n.startsWith('fruit') ? n : n === 'ice' ? 'ice' : 'bubble'}.svg" alt="" style="left:${x}%;top:${y}%;--w:${w}px">`))}
      <a class="btn hero2__cta" href="/products/${p.handle}">Shop ${p.title}</a>
    </article>`;
    })}`,
  );
  // pointer parallax
  const hero = $('[data-hero]');
  hero.addEventListener('mousemove', (e) => {
    const r = hero.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2),
      dy = e.clientY - (r.top + r.height / 2);
    $$('.hero2__slide.is-active .hero2__float', hero).forEach((el) => {
      const d = Number(el.dataset.depth) || 0.05;
      el.style.transform = `translate(${dx * d}px, ${dy * d}px)`;
    });
  });
  initHero(hero, { autoplay: 7500 });
}

/** Three cans fanned out beside the "soft drink" feature. */
function fan() {
  const el = $('[data-fan]');
  const list = ['sprite-250ml-can', 'coca-cola-original-250ml-can', 'fanta-orange-250ml-can']
    .map((h) => Store.get(h))
    .filter(Boolean);
  el.innerHTML = list.map((p) => `<img src="${esc(p.images.card)}" alt="" loading="lazy">`).join('');
}

/** Four short reviews in a table-style row. */
function reviewsTable() {
  const el = $('[data-reviews-table]');
  const cards = REVIEWS.slice(0, 4)
    .map((r) => ({ ...r, product: Store.get(r.handle) }))
    .filter((r) => r.product);
  el.innerHTML = String(
    html`${cards.map((r) => html`<article class="rv">${stars(r.rating, 'stars--sm')}<p>${r.text}</p><div class="rv__who"><span class="rv__avatar">${r.name[0]}</span><div><strong>${r.name}</strong><span>${r.place}</span></div></div></article>`)}`,
  );
}

/** One large article beside two small ones. */
function blogSplit() {
  const el = $('[data-blog-split]');
  const [a, ...rest] = Store.posts;
  const image = (p) =>
    html`<img src="${sized(p.image, 480)}" srcset="${srcset(p.image, [480], 960)}" sizes="(max-width: 989px) 100vw, 480px" alt="" loading="lazy">`;
  const more = (p) =>
    html`<a class="bcard__more" href="/blogs/news/${p.handle}">Read More<span class="sr-only"> about ${p.title}</span></a>`;
  const small = (p) =>
    html`<article class="bsmall"><a class="bcard__img" href="/blogs/news/${p.handle}">${image(p)}</a><div><span class="pill bcard__tag">${p.tag}</span><h3 class="bcard__title"><a href="/blogs/news/${p.handle}">${p.title}</a></h3>${more(p)}</div></article>`;
  el.innerHTML = String(
    html`<article class="bcard bbig" data-reveal="up"><a class="bcard__img" href="/blogs/news/${a.handle}">${image(a)}</a><span class="pill bcard__tag">${a.tag}</span><h3 class="bcard__title"><a href="/blogs/news/${a.handle}">${a.title}</a></h3>${more(a)}</article><div class="bside" data-reveal="left">${rest.slice(0, 2).map(small)}</div>`,
  );
}

/** Home V2: the same shop with a bolder hero. The grids reuse the card and the featured/strips sections of layout 1. */
export function init() {
  heroSlides();
  fan();
  const picks = [...Store.products].sort((a, b) => b.sold - a.sold);
  renderGrid(
    $('[data-grid="picks"]'),
    [...Store.products]
      .filter((p) => p.dealEndsAt || p.badges.includes('new'))
      .concat(picks)
      .filter((p, i, a) => a.indexOf(p) === i)
      .slice(0, 8),
  );
  renderGrid($('[data-grid="top"]'), picks.slice(8, 16));
  featured();
  strips();
  reviewsTable();
  blogSplit();
  startCountdowns();
  initReveal();
}
