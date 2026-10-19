// Search results page (/search?q=...). The matching and ranking live in Store.search(), shared with the header overlay.
import { $, html, startCountdowns } from '../ui.js';
import { Store } from '../store.js';
import { productCard } from '../card.js';
import { popularSearches } from '../sections.js';

export function init() {
  const q = (new URLSearchParams(location.search).get('q') || '').trim();
  $('#q').value = q;
  const root = $('[data-search-results]');
  if (!q) {
    $('[data-search-title]').textContent = 'Find your can';
    root.innerHTML = String(
      html`<div class="empty"><h3>What are you thirsty for?</h3><p>Try a brand like “Coca-Cola”, a flavour like “orange”, or “zero sugar”.</p><div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">${popularSearches()}</div></div>`,
    );
    return;
  }
  document.title = `Search: ${q} – Drink it`;
  const hits = Store.search(q);
  $('[data-search-title]').textContent = `${hits.length} result${hits.length === 1 ? '' : 's'} for “${q}”`;
  root.innerHTML = hits.length
    ? String(html`<div class="pgrid pgrid--light">${hits.map((p) => productCard(p))}</div>`)
    : String(
        html`<div class="empty"><h3>No cans found</h3><p>Check the spelling or try a broader word like “cola” or “energy”.</p><a class="btn" href="/collections/all">Browse all cans</a></div>`,
      );
  startCountdowns();
}
