// Collection page: filters (availability, price, brand, flavour, sugar, origin, size), sorting, view modes,
// all reflected in the URL so filtered pages can be shared.
import { $, $$, html, raw, esc, money, icon, lockScroll, debounce } from '../ui.js';
import { Store } from '../store.js';
import { productCard } from '../card.js';
import { bannerHtml, crumbs } from '../sections.js';
import { startCountdowns, initReveal } from '../ui.js';

const PAGE_SIZE = 24;
const SIZE_GROUPS = [
  { id: 'small', label: 'Slim cans (up to 250 ml)', test: (ml) => ml <= 250 },
  { id: 'std', label: 'Standard (320–355 ml)', test: (ml) => ml > 250 && ml < 500 },
  { id: 'large', label: 'Large (500 ml)', test: (ml) => ml >= 500 },
];

const parseSet = (sp, k) => new Set((sp.get(k) || '').split(',').filter(Boolean));

export function init() {
  const handle = decodeURIComponent(location.pathname.split('/')[2] || 'all');
  const sp = new URLSearchParams(location.search);
  const col = Store.collections.find((c) => c.handle === handle);
  const isAll = handle === 'all';
  if (!isAll && !col) { $('main').innerHTML = '<div class="empty"><h3>We couldn’t find that collection</h3><a class="btn" href="/collections">See all collections</a></div>'; return; }

  const brandHandle = sp.get('brand');
  const brand = Store.brands().find((b) => b.handle === brandHandle);
  const base = Store.products.filter((p) => isAll || p.collections.includes(handle));
  const title = brand ? brand.name : isAll ? 'All Cans' : col.title;
  const blurb = brand
    ? `Every ${brand.name} can we stock, from singles to 24-can cartons — delivered straight from the Drink it store.`
    : isAll ? 'Every cold drink can we sell, in one place. Filter by brand, flavour, size or sugar and stock up with 6-packs, 12-packs and cartons.' : col.blurb;
  document.title = `${title} – Drink it`;

  // ---------- banner, tiles, tags, crumbs ----------
  $('[data-collection-banner]').innerHTML = String(bannerHtml({ title, text: blurb }));
  $('[data-crumbs]').innerHTML = String(crumbs([{ label: 'Home', href: '/' }, { label: 'Collections', href: '/collections' }, { label: title }]));
  const tiles = [{ handle: 'all', title: 'All Cans', lead: Store.site.allLead || Store.products.slice().sort((a, b) => b.sold - a.sold)[0].handle }, ...Store.collections];
  $('[data-ctiles]').innerHTML = String(html`${tiles.map((c) => { const lead = Store.get(c.lead); return html`<a class="ctile${c.handle === handle && !brand ? ' is-active' : ''}" href="/collections/${c.handle}" style="--tile:${lead?.tile};--accent:${lead?.ink || 'var(--green)'}"><img src="${lead?.images.card}" alt="" loading="lazy"><span>${c.title}</span></a>`; })}`);
  $('[data-tagrow]').innerHTML = String(html`<strong>Brands:</strong>${Store.brands().slice(0, 9).map((b) => raw(`<a class="pill pill--btn${b.handle === brandHandle ? ' is-active' : ''}" href="/collections/all?brand=${esc(b.handle)}">${esc(b.name)}</a>`))}`);

  // ---------- state ----------
  const state = {
    brand: parseSet(sp, 'brand'), type: parseSet(sp, 'type'), sugar: parseSet(sp, 'sugar'), origin: parseSet(sp, 'origin'), size: parseSet(sp, 'size'),
    stock: sp.get('stock') || '', min: sp.get('min') || '', max: sp.get('max') || '',
    sort: sp.get('sort') || 'featured', pack: sp.get('pack') || 'single', view: localStorage.getItem('drinkit.view') || '3', shown: PAGE_SIZE,
  };
  const grid = $('[data-grid]');
  const maxPrice = Math.max(...base.map((p) => p.price));
  const count = (fn) => base.filter(fn).length;

  // ---------- filters sidebar ----------
  const groupHtml = (key, label, options, { open = true } = {}) => html`<details class="fgroup" ${open ? 'open' : ''}><summary>${label}${icon('chev-down')}</summary><div class="fgroup__body">${options.map((o) => html`<label class="fcheck${o.count === 0 ? ' is-disabled' : ''}"><input type="checkbox" data-f="${key}" value="${o.value}" ${state[key].has(o.value) ? 'checked' : ''}>${o.label}<em>${o.count}</em></label>`)}</div></details>`;
  const brands = Store.brands().map((b) => ({ value: b.handle, label: b.name, count: count((p) => p.brandHandle === b.handle) })).filter((o) => o.count);
  const types = [...new Set(base.map((p) => p.type))].map((t) => ({ value: t, label: t, count: count((p) => p.type === t) }));
  const renderFilters = () => {
    $('[data-filters]').innerHTML = String(html`<div class="filters__head"><h2>Filters</h2><button type="button" class="filters__clear" data-clear>Clear all</button></div>
      <details class="fgroup" open><summary>Availability${icon('chev-down')}</summary><div class="fgroup__body">
        <label class="fcheck"><input type="radio" name="stock" data-stock value="in" ${state.stock === 'in' ? 'checked' : ''}>In stock<em>${count((p) => p.stock > 0)}</em></label>
        <label class="fcheck"><input type="radio" name="stock" data-stock value="out" ${state.stock === 'out' ? 'checked' : ''}>Out of stock<em>${count((p) => p.stock <= 0)}</em></label>
      </div></details>
      <details class="fgroup" open><summary>Price${icon('chev-down')}</summary><div class="fgroup__body">
        <div class="price-range"><div class="input-wrap"><span>৳</span><input class="input" type="number" min="0" inputmode="numeric" placeholder="0" value="${state.min}" data-min aria-label="Minimum price"></div><span>to</span><div class="input-wrap"><span>৳</span><input class="input" type="number" min="0" inputmode="numeric" placeholder="${maxPrice}" value="${state.max}" data-max aria-label="Maximum price"></div></div>
        <p class="fnote">The highest price is ${money(maxPrice)}</p>
      </div></details>
      ${groupHtml('brand', 'Brand', brands)}
      ${groupHtml('type', 'Flavor', types)}
      ${groupHtml('sugar', 'Sugar', [{ value: 'Regular', label: 'Regular', count: count((p) => p.sugar === 'Regular') }, { value: 'Zero', label: 'Zero sugar', count: count((p) => p.sugar === 'Zero') }], { open: false })}
      ${groupHtml('origin', 'Origin', [{ value: 'Local', label: 'Bottled in Bangladesh', count: count((p) => p.origin === 'Local') }, { value: 'Imported', label: 'Imported', count: count((p) => p.origin === 'Imported') }], { open: false })}
      ${groupHtml('size', 'Can size', SIZE_GROUPS.map((g) => ({ value: g.id, label: g.label, count: count((p) => g.test(p.canMl)) })), { open: false })}
      <button class="btn btn--block filters__apply" type="button" data-filter-close>Show results</button>`);
  };

  // ---------- filtering / sorting / render ----------
  const matches = (p) => {
    if (state.brand.size && !state.brand.has(p.brandHandle)) return false;
    if (state.type.size && !state.type.has(p.type)) return false;
    if (state.sugar.size && !state.sugar.has(p.sugar)) return false;
    if (state.origin.size && !state.origin.has(p.origin)) return false;
    if (state.size.size && ![...state.size].some((id) => SIZE_GROUPS.find((g) => g.id === id)?.test(p.canMl))) return false;
    if (state.stock === 'in' && p.stock <= 0) return false;
    if (state.stock === 'out' && p.stock > 0) return false;
    if (state.min !== '' && p.price < Number(state.min)) return false;
    if (state.max !== '' && p.price > Number(state.max)) return false;
    return true;
  };
  const sorters = {
    featured: (a, b) => (a.stock <= 0) - (b.stock <= 0) || b.sold - a.sold,
    best: (a, b) => b.sold - a.sold,
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    'title-asc': (a, b) => a.title.localeCompare(b.title),
    new: (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
  };
  const pushUrl = () => {
    const q = new URLSearchParams();
    for (const k of ['brand', 'type', 'sugar', 'origin', 'size']) if (state[k].size) q.set(k, [...state[k]].join(','));
    if (state.stock) q.set('stock', state.stock);
    if (state.min !== '') q.set('min', state.min);
    if (state.max !== '') q.set('max', state.max);
    if (state.sort !== 'featured') q.set('sort', state.sort);
    if (state.pack !== 'single') q.set('pack', state.pack);
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  };
  const render = () => {
    const list = base.filter(matches).sort(sorters[state.sort] || sorters.featured);
    $('[data-count]').textContent = `${list.length} ${list.length === 1 ? 'item' : 'items'}`;
    grid.dataset.view = state.view === 'list' ? 'list' : 'grid';
    grid.style.setProperty('--cols', state.view === 'list' ? 1 : state.view);
    $$('.views button').forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.view));
    if (!list.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>No cans match those filters</h3><p>Try removing a filter or two.</p><button class="btn" type="button" data-clear>Clear all filters</button></div>';
      $('[data-more]').hidden = true;
    } else {
      grid.innerHTML = String(html`${list.slice(0, state.shown).map((p) => productCard(p, { pack: state.pack }))}`);
      $('[data-more]').hidden = list.length <= state.shown;
    }
    startCountdowns();
    pushUrl();
  };

  renderFilters();
  $('[data-sort]').value = state.sort;
  render();

  // ---------- events ----------
  const filters = $('[data-filters]');
  filters.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-f]')) { const s = state[t.dataset.f]; t.checked ? s.add(t.value) : s.delete(t.value); }
    else if (t.matches('[data-stock]')) state.stock = t.checked ? t.value : '';
    state.shown = PAGE_SIZE;
    render();
  });
  filters.addEventListener('click', (e) => {
    if (e.target.matches('[data-stock]') && e.target.value === state.stock && e.target.dataset.was === '1') { state.stock = ''; e.target.checked = false; render(); }
    if (e.target.matches('[data-stock]')) e.target.dataset.was = e.target.checked ? '1' : '';
  });
  filters.addEventListener('input', debounce((e) => {
    if (e.target.matches('[data-min]')) state.min = e.target.value;
    if (e.target.matches('[data-max]')) state.max = e.target.value;
    if (e.target.matches('[data-min],[data-max]')) { state.shown = PAGE_SIZE; render(); }
  }, 300));
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) {
      for (const k of ['brand', 'type', 'sugar', 'origin', 'size']) state[k].clear();
      Object.assign(state, { stock: '', min: '', max: '', shown: PAGE_SIZE });
      renderFilters(); render();
    }
  });
  $('[data-sort]').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  $$('.views button').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; try { localStorage.setItem('drinkit.view', state.view); } catch { /* ignore */ } render(); }));
  $('[data-more]').addEventListener('click', () => { state.shown += PAGE_SIZE; render(); });

  // mobile filter drawer
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  document.body.append(overlay);
  const openF = () => { filters.classList.add('is-open'); overlay.classList.add('is-open'); lockScroll(true); };
  const closeF = () => { filters.classList.remove('is-open'); overlay.classList.remove('is-open'); lockScroll(false); };
  $('[data-filter-open]').addEventListener('click', openF);
  overlay.addEventListener('click', closeF);
  filters.addEventListener('click', (e) => { if (e.target.closest('[data-filter-close]')) closeF(); });
  initReveal();
}
