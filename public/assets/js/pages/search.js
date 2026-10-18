import { $, html, raw, esc, startCountdowns } from '../ui.js';
import { Store } from '../store.js';
import { productCard } from '../card.js';

function score(p, terms) {
  const title = p.title.toLowerCase();
  const hay =
    `${p.title} ${p.brand} ${p.variant} ${p.type} ${p.origin} ${p.sugar === 'Zero' ? 'zero sugar sugarfree' : ''} ${p.caffeine ? 'energy caffeine' : ''} ${p.collections.join(' ')} ${p.canMl}ml ${p.canMl} ml`.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (!hay.includes(t)) return 0;
    s += title.startsWith(t) ? 6 : title.includes(t) ? 4 : 1;
  }
  return s + p.sold / 10000;
}

export function init() {
  const q = (new URLSearchParams(location.search).get('q') || '').trim();
  const input = $('#q');
  input.value = q;
  const root = $('[data-search-results]');
  if (!q) {
    $('[data-search-title]').textContent = 'Find your can';
    root.innerHTML = String(
      html`<div class="empty"><h3>What are you thirsty for?</h3><p>Try a brand like “Coca-Cola”, a flavour like “orange”, or “zero sugar”.</p><div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">${['Coca-Cola', 'Pepsi', 'Sprite', 'Mojo', 'Energy', 'Zero sugar', 'Imported'].map((t) => raw(`<a class="pill pill--btn" href="/search?q=${encodeURIComponent(t)}">${esc(t)}</a>`))}</div></div>`,
    );
    return;
  }
  document.title = `Search: ${q} – Drink it`;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = Store.products
    .map((p) => ({ p, s: score(p, terms) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
  $('[data-search-title]').textContent = `${hits.length} result${hits.length === 1 ? '' : 's'} for “${q}”`;
  root.innerHTML = hits.length
    ? String(html`<div class="pgrid pgrid--light">${hits.map((p) => productCard(p))}</div>`)
    : String(
        html`<div class="empty"><h3>No cans found</h3><p>Check the spelling or try a broader word like “cola” or “energy”.</p><a class="btn" href="/collections/all">Browse all cans</a></div>`,
      );
  startCountdowns();
}
