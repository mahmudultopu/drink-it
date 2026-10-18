// Reusable page sections rendered from JS: FAQ accordion, breadcrumbs and the call-to-action banner.
import { html, raw, esc, icon } from './ui.js';

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

/**
 * Fill [data-cta] placeholders (on pages whose content is rendered by script) with the call-to-action banner. Pages
 * rendered by the server include the banner directly; the markup lives in partials/cta.html either way.
 */
export function mountCtas() {
  const template = document.querySelector('template[data-cta-template]');
  if (!template) return;
  document.querySelectorAll('[data-cta]').forEach((slot) => slot.replaceChildren(template.content.cloneNode(true)));
}
