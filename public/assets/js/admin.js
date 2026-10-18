// Drink it admin dashboard (orders, products, reviews, messages, subscribers, customers).
import { $, $$, html, raw, esc, money, toast, fmtDate, debounce } from './ui.js';
import { api } from './api.js';

const root = $('#admin-root');
const STATUSES = ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
const STATUS_LABEL = { placed: 'Placed', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
const PAY_LABEL = { cod: 'Cash on delivery', bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' };
const PAY_STATUS = ['cod', 'awaiting', 'paid', 'failed', 'refunded'];
const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
const chip = (s) => html`<span class="chip chip--${s}">${STATUS_LABEL[s] || s}</span>`;

let tab = location.hash.slice(1) || 'dashboard';
let stats = null;

async function boot() {
  let ok = false;
  try { ok = (await api('/admin/session')).admin; } catch { /* offline */ }
  ok ? shell() : login();
}

// ---------------------------------------------------------------- login
function login(msg = '') {
  document.title = 'Admin login – Drink it';
  root.innerHTML = String(html`<div class="admin-login"><form class="admin-login__box" data-login novalidate>
    <img src="/assets/img/shapes/logo.svg" alt="Drink it" height="48">
    <h1>Admin</h1><p class="muted">Enter the admin password to manage orders, products and reviews.</p>
    <div class="field"><label for="pw">Password</label><input class="input" id="pw" type="password" autocomplete="current-password" autofocus></div>
    ${msg ? html`<div class="form-note form-note--error">${msg}</div>` : ''}
    <button class="btn btn--block" type="submit"><span>Sign in</span></button>
    <p class="muted" style="font-size:13px;margin-top:6px">Forgot it? Run <code>node server.js --reset-admin</code> on the server.</p>
  </form></div>`);
  $('[data-login]').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/admin/login', { method: 'POST', body: { password: $('#pw').value } }); shell(); } catch (err) { login(err.message); }
  });
}

// ---------------------------------------------------------------- shell
const NAV = [['dashboard', 'Dashboard', 'grid'], ['orders', 'Orders', 'box'], ['products', 'Products', 'bag'], ['reviews', 'Reviews', 'heart'], ['messages', 'Messages', 'mail'], ['subscribers', 'Subscribers', 'user'], ['customers', 'Customers', 'user']];
async function shell() {
  document.title = 'Admin – Drink it';
  try { stats = await api('/admin/stats'); } catch (e) { if (e.status === 401) return login(); }
  const badge = (k) => ({ orders: stats?.orders.byStatus.placed, reviews: stats?.pendingReviews, messages: stats?.unreadMessages }[k] || 0);
  root.innerHTML = String(html`<div class="admin-shell"><aside class="admin-nav"><a class="admin-nav__logo" href="/admin"><img src="/assets/img/shapes/logo-lime.svg" alt="Drink it" height="40"></a>
    <nav>${NAV.map(([k, l]) => html`<button type="button" data-nav="${k}" class="${tab === k ? 'is-active' : ''}">${l}${badge(k) ? html`<i>${badge(k)}</i>` : ''}</button>`)}</nav>
    <div class="admin-nav__foot"><a href="/" target="_blank" rel="noopener">View store ↗</a><button type="button" data-logout>Log out</button></div></aside>
    <main class="admin-main" data-admin-view></main></div>`);
  $$('[data-nav]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.nav; location.hash = tab; shell(); }));
  $('[data-logout]').addEventListener('click', async () => { await api('/admin/logout', { method: 'POST', body: {} }); login(); });
  await views[tab]?.($('[data-admin-view]'));
}

const head = (title, extra = '') => html`<header class="admin-head"><h1>${title}</h1><div>${extra}</div></header>`;
const errBox = (e) => html`<div class="form-note form-note--error">${e.message}</div>`;

// ---------------------------------------------------------------- views
const views = {
  async dashboard(el) {
    const s = stats;
    const card = (label, value, sub = '') => html`<div class="stat"><span>${label}</span><b>${value}</b>${sub ? html`<small>${sub}</small>` : ''}</div>`;
    el.innerHTML = String(html`${head('Dashboard')}
      ${s.placeholderPayments ? html`<div class="form-note form-note--error"><b>Heads up:</b> your bKash / Nagad / Rocket numbers in <code>data/site.json</code> are still placeholders. Customers will see them at checkout — edit before going live.</div>` : ''}
      <div class="stats-grid">
        ${card('Orders today', s.orders.today, `${s.orders.total} total`)}
        ${card('Revenue today', money(s.revenue.today), `${money(s.revenue.total)} all-time (excl. cancelled)`)}
        ${card('Average order', money(s.avgOrder))}
        ${card('Awaiting payment check', s.awaitingPayment, 'bKash / Nagad / Rocket')}
        ${card('New orders to confirm', s.orders.byStatus.placed)}
        ${card('Reviews to approve', s.pendingReviews)}
        ${card('Unread messages', s.unreadMessages)}
        ${card('Newsletter subscribers', s.subscribers)}
      </div>
      <div class="admin-cols">
        <section class="panel"><h2>Orders by status</h2><ul class="bars">${STATUSES.map((k) => { const n = s.orders.byStatus[k]; const pct = s.orders.total ? (n / s.orders.total) * 100 : 0; return html`<li><span>${STATUS_LABEL[k]}</span><i><b style="width:${pct}%"></b></i><em>${n}</em></li>`; })}</ul></section>
        <section class="panel"><h2>Top selling cans</h2>${s.top.length ? html`<ol class="toplist">${s.top.map((t) => html`<li><a href="/products/${t.handle}" target="_blank" rel="noopener">${t.title}</a><b>${t.cans} can${t.cans === 1 ? '' : 's'}</b></li>`)}</ol>` : html`<p class="muted">No sales yet.</p>`}</section>
        <section class="panel"><h2>Low stock</h2>${s.lowStock.length ? html`<ul class="toplist">${s.lowStock.map((t) => html`<li><a href="/products/${t.handle}" target="_blank" rel="noopener">${t.title}</a><b class="${t.stock === 0 ? 'bad' : ''}">${t.stock} left</b></li>`)}</ul>` : html`<p class="muted">Everything is well stocked.</p>`}</section>
      </div>`);
  },

  async orders(el) {
    let status = '', q = '', pay = false;
    el.innerHTML = String(html`${head('Orders', raw('<a class="btn btn--sm btn--lime" href="/api/admin/orders.csv">Export CSV</a>'))}
      <div class="toolbar"><input class="input" type="search" placeholder="Search number, name, phone, district…" data-q>
        <select class="select" data-status><option value="">All statuses</option>${STATUSES.map((s) => html`<option value="${s}">${STATUS_LABEL[s]}</option>`)}</select>
        <label class="check"><input type="checkbox" data-pay><span>Awaiting payment check</span></label></div>
      <div class="table-wrap"><table class="atable"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Area</th><th>Cans</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody data-rows><tr><td colspan="8">Loading…</td></tr></tbody></table></div>`);
    const load = async () => {
      try {
        const { orders } = await api(`/admin/orders?status=${status}&q=${encodeURIComponent(q)}${pay ? '&payment=awaiting' : ''}`);
        $('[data-rows]').innerHTML = orders.length ? String(html`${orders.map((o) => html`<tr data-id="${o.id}" tabindex="0"><td><b>${o.number}</b></td><td>${when(o.createdAt)}</td><td>${o.customer.name}<br><small>${o.customer.phone}</small></td><td>${o.shipping.district}</td><td>${o.pricing.cans}</td><td><b>${money(o.pricing.total)}</b></td><td>${PAY_LABEL[o.payment.method]}<br><small class="pay--${o.payment.status}">${o.payment.status}</small></td><td>${chip(o.status)}</td></tr>`)}`) : '<tr><td colspan="8" class="muted">No orders match.</td></tr>';
        $$('[data-id]').forEach((tr) => { const open = () => orderModal(orders.find((x) => x.id === tr.dataset.id), load); tr.addEventListener('click', open); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); }); });
      } catch (e) { $('[data-rows]').innerHTML = `<tr><td colspan="8">${esc(e.message)}</td></tr>`; }
    };
    $('[data-q]').addEventListener('input', debounce((e) => { q = e.target.value; load(); }, 250));
    $('[data-status]').addEventListener('change', (e) => { status = e.target.value; load(); });
    $('[data-pay]').addEventListener('change', (e) => { pay = e.target.checked; load(); });
    load();
  },

  async products(el) {
    el.innerHTML = String(html`${head('Products')}<p class="muted" style="margin-bottom:14px">Edit the single-can price and stock. Pack prices (6 / 12 / 24) recalculate automatically.</p><div class="table-wrap"><table class="atable"><thead><tr><th></th><th>Product</th><th>Price ৳</th><th>Old price ৳</th><th>Stock (cans)</th><th>Deal ends</th><th></th></tr></thead><tbody data-rows><tr><td colspan="7">Loading…</td></tr></tbody></table></div>`);
    try {
      const { products } = await api('/admin/products');
      $('[data-rows]').innerHTML = String(html`${products.map((p) => html`<tr data-h="${p.handle}"><td><span class="thumb" style="--tile:${p.tile}"><img src="${p.image}" alt=""></span></td><td><a href="/products/${p.handle}" target="_blank" rel="noopener"><b>${p.title}</b></a><br><small>${p.brand} · ${p.canMl} ml</small></td><td><input class="input input--sm" type="number" min="1" name="price" value="${p.price}"></td><td><input class="input input--sm" type="number" min="0" name="compareAt" value="${p.compareAt || ''}" placeholder="—"></td><td><input class="input input--sm ${p.stock < 25 ? 'is-low' : ''}" type="number" min="0" name="stock" value="${p.stock}"></td><td><input class="input input--sm" type="datetime-local" name="dealEndsAt" value="${p.dealEndsAt ? new Date(new Date(p.dealEndsAt).getTime() + 6 * 3600e3).toISOString().slice(0, 16) : ''}"></td><td><button class="btn btn--sm" type="button" data-save>Save</button></td></tr>`)}`);
      $$('[data-save]').forEach((b) => b.addEventListener('click', async () => {
        const tr = b.closest('tr');
        const v = (n) => tr.querySelector(`[name=${n}]`).value;
        const deal = v('dealEndsAt');
        b.classList.add('is-loading');
        try { await api('/admin/products/' + tr.dataset.h, { method: 'PATCH', body: { price: v('price'), compareAt: v('compareAt') || 0, stock: v('stock'), dealEndsAt: deal ? new Date(deal + ':00+06:00').toISOString() : null } }); toast('Saved.'); }
        catch (e) { toast(e.message, { type: 'error' }); } finally { b.classList.remove('is-loading'); }
      }));
    } catch (e) { $('[data-rows]').innerHTML = `<tr><td colspan="7">${esc(e.message)}</td></tr>`; }
  },

  async reviews(el) {
    el.innerHTML = String(html`${head('Reviews')}<div data-list>Loading…</div>`);
    const load = async () => {
      try {
        const { reviews } = await api('/admin/reviews');
        $('[data-list]').innerHTML = reviews.length ? String(html`<div class="rv-admin">${reviews.map((r) => html`<article class="rv-admin__item ${r.approved ? '' : 'is-pending'}"><div><b>${r.name}</b> · ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} · <small>${r.product}</small> ${r.sample ? html`<span class="chip">sample</span>` : ''} ${r.approved ? '' : html`<span class="chip chip--placed">pending</span>`}<br>${r.title ? html`<b>${r.title}</b><br>` : ''}${r.body}<br><small>${when(r.createdAt)}</small></div><div class="rv-admin__act">${r.approved ? html`<button class="btn btn--sm btn--ghost" data-act="hide" data-id="${r.id}">Hide</button>` : html`<button class="btn btn--sm" data-act="approve" data-id="${r.id}">Approve</button>`}<button class="btn btn--sm btn--ghost" data-act="del" data-id="${r.id}">Delete</button></div></article>`)}</div>`) : '<p class="muted">No reviews yet.</p>';
        $$('[data-act]').forEach((b) => b.addEventListener('click', async () => {
          try {
            if (b.dataset.act === 'del') { if (!confirm('Delete this review?')) return; await api('/admin/reviews/' + b.dataset.id, { method: 'DELETE', body: {} }); }
            else await api('/admin/reviews/' + b.dataset.id, { method: 'PATCH', body: { approved: b.dataset.act === 'approve' } });
            load();
          } catch (e) { toast(e.message, { type: 'error' }); }
        }));
      } catch (e) { $('[data-list]').innerHTML = String(errBox(e)); }
    };
    load();
  },

  async messages(el) {
    el.innerHTML = String(html`${head('Messages')}<div data-list>Loading…</div>`);
    try {
      const { messages } = await api('/admin/messages');
      $('[data-list]').innerHTML = messages.length ? String(html`<div class="rv-admin">${messages.map((m) => html`<article class="rv-admin__item ${m.read ? '' : 'is-pending'}"><div><b>${m.name}</b> · <a href="mailto:${m.email}">${m.email}</a>${m.phone ? ` · ${m.phone}` : ''}<br>${m.message}<br><small>${when(m.createdAt)}</small></div><div class="rv-admin__act"><button class="btn btn--sm btn--ghost" data-id="${m.id}" data-read="${m.read ? '0' : '1'}">${m.read ? 'Mark unread' : 'Mark read'}</button></div></article>`)}</div>`) : '<p class="muted">No messages yet.</p>';
      $$('[data-read]').forEach((b) => b.addEventListener('click', async () => { await api('/admin/messages/' + b.dataset.id, { method: 'PATCH', body: { read: b.dataset.read === '1' } }); views.messages(el); }));
    } catch (e) { $('[data-list]').innerHTML = String(errBox(e)); }
  },

  async subscribers(el) {
    el.innerHTML = String(html`${head('Subscribers')}<div data-list>Loading…</div>`);
    try {
      const { subscribers } = await api('/admin/subscribers');
      $('[data-list]').innerHTML = subscribers.length ? String(html`<div class="table-wrap"><table class="atable"><thead><tr><th>Email</th><th>Joined</th></tr></thead><tbody>${subscribers.map((s) => html`<tr><td>${s.email}</td><td>${when(s.createdAt)}</td></tr>`)}</tbody></table></div><p style="margin-top:14px"><button class="btn btn--sm" type="button" data-copy>Copy all emails</button></p>`) : '<p class="muted">No subscribers yet.</p>';
      $('[data-copy]')?.addEventListener('click', async () => { await navigator.clipboard.writeText(subscribers.map((s) => s.email).join(', ')); toast('Emails copied.'); });
    } catch (e) { $('[data-list]').innerHTML = String(errBox(e)); }
  },

  async customers(el) {
    el.innerHTML = String(html`${head('Customers')}<div data-list>Loading…</div>`);
    try {
      const { customers } = await api('/admin/customers');
      $('[data-list]').innerHTML = customers.length ? String(html`<div class="table-wrap"><table class="atable"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Orders</th><th>Joined</th></tr></thead><tbody>${customers.map((c) => html`<tr><td>${c.name}</td><td>${c.phone}</td><td>${c.email || '—'}</td><td>${c.orders}</td><td>${fmtDate(c.createdAt)}</td></tr>`)}</tbody></table></div>`) : '<p class="muted">No registered customers yet. Guests can still order without an account.</p>';
    } catch (e) { $('[data-list]').innerHTML = String(errBox(e)); }
  },
};

// ---------------------------------------------------------------- order detail modal
function orderModal(o, refresh) {
  const m = document.createElement('div');
  m.className = 'modal is-open admin-modal';
  m.innerHTML = String(html`<div class="modal__backdrop" data-close></div><div class="modal__panel"><button class="icon-btn modal__close" type="button" data-close aria-label="Close"><svg class="ico" viewBox="0 0 24 24"><use href="/assets/img/icons.svg#close"/></svg></button>
    <div class="admin-order">
      <header><p class="eyebrow">Order</p><h2>${o.number}</h2><small>${when(o.createdAt)} ${chip(o.status)}</small></header>
      <div class="admin-order__grid">
        <section><h3>Customer</h3><p><b>${o.customer.name}</b><br><a href="tel:${o.customer.phone}">${o.customer.phone}</a>${o.customer.email ? html`<br><a href="mailto:${o.customer.email}">${o.customer.email}</a>` : ''}</p>
          <h3>Delivery address</h3><p>${o.shipping.address}<br>${o.shipping.area}, ${o.shipping.district}, ${o.shipping.division}</p>${o.shipping.notes ? html`<p><b>Note:</b> ${o.shipping.notes}</p>` : ''}
          <h3>Payment</h3><p>${PAY_LABEL[o.payment.method]} · <b class="pay--${o.payment.status}">${o.payment.status}</b>${o.payment.trxId ? html`<br>TrxID <b>${o.payment.trxId}</b> from ${o.payment.sender}` : ''}</p></section>
        <section><h3>Items</h3><ul class="oitems">${o.items.map((l) => html`<li><span class="oitems__img" style="--tile:${l.tile}"><img src="${l.packImage || l.image}" alt=""></span><span>${l.title}<small>${l.packLabel} × ${l.qty} (${l.cans} cans)</small></span><b>${money(l.lineTotal)}</b></li>`)}</ul>
          <dl class="summary__rows summary__rows--tight"><div><dt>Subtotal</dt><dd>${money(o.pricing.subtotal)}</dd></div>${o.pricing.discount ? html`<div><dt>Discount ${o.pricing.coupon ? `(${o.pricing.coupon.code})` : ''}</dt><dd>−${money(o.pricing.discount)}</dd></div>` : ''}<div><dt>Delivery</dt><dd>${o.pricing.delivery ? money(o.pricing.delivery) : 'Free'}</dd></div></dl>
          <div class="summary__total"><span>Total</span><b>${money(o.pricing.total)}</b></div></section>
      </div>
      <div class="admin-order__actions">
        <div class="field"><label for="st">Order status</label><select class="select" id="st">${STATUSES.map((s) => html`<option value="${s}" ${s === o.status ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`)}</select></div>
        <div class="field"><label for="pst">Payment status</label><select class="select" id="pst">${PAY_STATUS.map((s) => html`<option ${s === o.payment.status ? 'selected' : ''}>${s}</option>`)}</select></div>
        <div class="field fgrid__full"><label for="note">Note on this change (shown to customer in history)</label><input class="input" id="note" maxlength="200" placeholder="e.g. Handed to courier"></div>
        <div class="field fgrid__full"><label for="anote">Internal note (private)</label><textarea class="textarea" id="anote" rows="2" maxlength="500">${o.adminNote || ''}</textarea></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="btn" type="button" data-save>Save changes</button><button class="btn btn--ghost" type="button" onclick="window.print()">Print slip</button><a class="btn btn--ghost" href="/orders/${o.number}?phone=${o.customer.phone}" target="_blank" rel="noopener">Customer view ↗</a></div>
      <h3 style="margin-top:22px">History</h3><ul class="hist">${o.history.slice().reverse().map((h) => html`<li><b>${STATUS_LABEL[h.status]}</b> · ${when(h.at)}${h.note ? ` — ${h.note}` : ''}</li>`)}</ul>
    </div></div>`);
  document.body.append(m);
  const close = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  $('[data-save]', m).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('is-loading');
    try {
      await api('/admin/orders/' + o.id, { method: 'PATCH', body: { status: $('#st', m).value, note: $('#note', m).value, paymentStatus: $('#pst', m).value, adminNote: $('#anote', m).value } });
      toast('Order updated.'); close(); refresh?.(); stats = await api('/admin/stats').catch(() => stats);
    } catch (err) { toast(err.message, { type: 'error' }); } finally { btn.classList.remove('is-loading'); }
  });
}

boot();
