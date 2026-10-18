// Reusable page sections rendered from JS: inner-page banner, CTA banner, FAQ accordion, breadcrumbs.
import { html, raw, esc, icon } from './ui.js';

export function bannerHtml({ title, text, cta }) {
  return html`<div class="banner__media"><img src="/assets/img/scenes/banner-cans.webp" alt="" width="1424" height="852" fetchpriority="high"></div>
  <div class="banner__panel" data-reveal="left"><h1>${title}</h1>${text ? html`<p>${text}</p>` : ''}${cta ? raw(`<a class="btn btn--lime" href="${esc(cta.href)}">${esc(cta.label)}</a>`) : ''}</div>`;
}

const FRUITS = [
  ['lime', '8%', '18%', 64, 0],
  ['orange', '2%', '62%', 56, 1.2],
  ['mango', '17%', 'auto', 54, 0.6],
  ['lemon', '90%', '16%', 60, 0.8],
  ['cherry', '96%', '60%', 52, 0.2],
  ['grape', '82%', 'auto', 56, 1.6],
];
export function ctaHtml() {
  return html`<section class="cta" data-reveal="up">
    ${FRUITS.map(([n, x, y, w, d]) => raw(`<img class="cta__fruit" src="/assets/img/shapes/fruit-${n}.svg" alt="" style="left:${x};${y === 'auto' ? 'bottom:-14px' : `top:${y}`};--w:${w}px;--d:${d}s" width="${w}" height="${w}" loading="lazy">`))}
    <p class="eyebrow">Ready to Sip?</p>
    <h2>Don’t Wait – Order Now!</h2>
    <p>Experience the perfect mix of bold flavours and ice-cold fizz with every can. Whether you’re chilling at home or hosting friends, there’s always a can waiting to brighten your moment.</p>
    <a class="btn" href="/collections/all">View Products</a>
  </section>`;
}

export function accordionHtml(items) {
  return html`<div class="acc">${items.map(
    (it, i) => html`<div class="acc__item${i === 0 ? '' : ''}">
    <button class="acc__q" type="button" aria-expanded="false">${it.q}${icon('chev-down')}</button>
    <div class="acc__a"><div><p>${it.a}</p></div></div>
  </div>`,
  )}</div>`;
}

export function initAccordions(root = document) {
  root.addEventListener('click', (e) => {
    const q = e.target.closest('.acc__q');
    if (!q) return;
    const item = q.closest('.acc__item');
    const open = item.classList.toggle('is-open');
    q.setAttribute('aria-expanded', open);
  });
}

export function crumbs(items) {
  return html`<nav class="crumbs" aria-label="Breadcrumb">${items.map((it, i) =>
    i === items.length - 1
      ? raw(`<span aria-current="page">${esc(it.label)}</span>`)
      : raw(
          `<a href="${esc(it.href)}">${esc(it.label)}</a><svg viewBox="0 0 24 24"><use href="/assets/img/icons.svg#chev-right"/></svg>`,
        ),
  )}</nav>`;
}

/** Replace [data-cta] placeholders with the call-to-action banner. */
export function mountCtas() {
  document.querySelectorAll('[data-cta]').forEach((el) => {
    el.innerHTML = String(ctaHtml());
  });
}
