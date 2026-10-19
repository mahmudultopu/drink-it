// Reusable page sections rendered from JS: FAQ accordion, breadcrumbs and the call-to-action banner.
import { html, raw, esc, icon } from './ui.js';

const POPULAR_SEARCHES = ['Coca-Cola', 'Pepsi', 'Sprite', 'Mojo', 'Energy', 'Zero sugar', 'Imported'];

/** Links to a few common searches, offered by the search overlay and the search page when nothing is typed yet. */
export const popularSearches = () =>
  html`${POPULAR_SEARCHES.map((t) => html`<a class="pill pill--btn" href="/search?q=${encodeURIComponent(t)}">${t}</a>`)}`;

/** FAQ-style accordion: a list of question buttons that expand to show their answer (see initAccordions). */
export function accordionHtml(items) {
  return html`<div class="acc">${items.map(
    (it) => html`<div class="acc__item">
    <button class="acc__q" type="button" aria-expanded="false">${it.q}${icon('chev-down')}</button>
    <div class="acc__a"><div><p>${it.a}</p></div></div>
  </div>`,
  )}</div>`;
}

/** One delegated click handler opens and closes every accordion item, and keeps aria-expanded in step. */
export function initAccordions(root = document) {
  root.addEventListener('click', (e) => {
    const q = e.target.closest('.acc__q');
    if (!q) return;
    const item = q.closest('.acc__item');
    const open = item.classList.toggle('is-open');
    q.setAttribute('aria-expanded', open);
  });
}

/** Breadcrumb trail; the last item is the current page and is not a link. */
export function crumbs(items) {
  return html`<nav class="crumbs" aria-label="Breadcrumb">${items.map((it, i) =>
    i === items.length - 1
      ? raw(`<span aria-current="page">${esc(it.label)}</span>`)
      : raw(
          `<a href="${esc(it.href)}">${esc(it.label)}</a><svg viewBox="0 0 24 24"><use href="/assets/img/icons.svg#chev-right"/></svg>`,
        ),
  )}</nav>`;
}

/**
 * Fill [data-cta] placeholders (on pages whose content is rendered by script) with the call-to-action banner. Pages
 * rendered by the server include the banner directly; the markup lives in partials/cta.html either way.
 */
export function mountCtas() {
  const template = document.querySelector('template[data-cta-template]');
  if (!template) return;
  document.querySelectorAll('[data-cta]').forEach((slot) => slot.replaceChildren(template.content.cloneNode(true)));
}
