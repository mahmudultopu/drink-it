// Customer account: orders, profile, saved addresses.
import { $, $$, html, raw, esc, money, toast, fmtDate } from '../ui.js';
import { Store } from '../store.js';
import { api } from '../api.js';
import { statusChip } from '../order-view.js';

export async function init() {
  if (!Store.user) { location.replace('/account/login?next=/account'); return; }
  document.title = 'My account – Drink it';
  const root = $('[data-account]');
  let user = Store.user;
  let tab = location.hash.slice(1) || 'orders';
  let orders = null;
  const divisions = Store.site.divisions;

  const header = () => html`<div class="accountpage__head"><div><p class="eyebrow">My account</p><h1>Hello, ${user.name.split(' ')[0]}</h1></div><button class="btn btn--ghost btn--sm" type="button" data-logout>Log out</button></div>`;

  const views = {
    async orders() {
      if (!orders) { try { orders = (await api('/me/orders')).orders; } catch { orders = []; } }
      if (!orders.length) return html`<div class="empty"><h3>No orders yet</h3><p>When you place an order it will show up here.</p><a class="btn" href="/collections/all">Start shopping</a></div>`;
      return html`<div class="orders-list">${orders.map((o) => html`<a class="order-row" href="/orders/${o.number}?phone=${o.customer.phone}"><div><b>${o.number}</b><br><small>${fmtDate(o.createdAt)} · ${o.items.reduce((s, l) => s + l.cans, 0)} cans</small><div class="order-row__thumbs">${o.items.slice(0, 5).map((l) => html`<span style="--tile:${l.tile}"><img src="${l.image}" alt=""></span>`)}</div></div><div style="text-align:right;display:grid;gap:8px;justify-items:end">${statusChip(o.status)}<b>${money(o.pricing.total)}</b></div></a>`)}</div>`;
    },
    profile() {
      return html`<form class="panel" data-profile novalidate><h2>Profile</h2><div class="fgrid">
        <div class="field"><label for="p-name">Full name</label><input class="input" id="p-name" name="name" value="${user.name}" maxlength="80"><div class="field__error" data-err="name"></div></div>
        <div class="field"><label for="p-phone">Mobile number</label><input class="input" id="p-phone" value="${user.phone}" disabled></div>
        <div class="field fgrid__full"><label for="p-email">Email</label><input class="input" id="p-email" name="email" type="email" value="${user.email || ''}"><div class="field__error" data-err="email"></div></div>
      </div><div style="margin-top:18px"><button class="btn" type="submit"><span>Save changes</span></button></div></form>`;
    },
    addresses() {
      const list = user.addresses || [];
      return html`<div class="panel"><h2>Saved addresses</h2><div class="addr">${list.length ? list.map((a, i) => html`<div class="addr__item"><div><b>${a.label}</b>${a.address}<br>${a.area}, ${a.district}, ${a.division}</div><button class="btn btn--ghost btn--sm" type="button" data-del="${i}">Remove</button></div>`) : html`<p class="muted">You haven’t saved an address yet.</p>`}</div>
        ${list.length < 5 ? html`<form data-addr novalidate style="margin-top:26px"><h3 style="font-size:22px;margin-bottom:14px">Add an address</h3><div class="fgrid">
          <div class="field"><label for="a-label">Label</label><input class="input" id="a-label" name="label" placeholder="Home, Office…" maxlength="30"></div>
          <div class="field"><label for="a-div">Division</label><select class="select" id="a-div" name="division">${Object.keys(divisions).map((d) => html`<option>${d}</option>`)}</select></div>
          <div class="field"><label for="a-dist">District</label><select class="select" id="a-dist" name="district"></select></div>
          <div class="field"><label for="a-area">Area / Thana</label><input class="input" id="a-area" name="area" maxlength="80"></div>
          <div class="field fgrid__full"><label for="a-addr">Full address</label><textarea class="textarea" id="a-addr" name="address" rows="3" maxlength="300"></textarea></div>
        </div><div style="margin-top:16px"><button class="btn" type="submit">Save address</button></div></form>` : ''}</div>`;
    },
  };

  async function render() {
    const body = await views[tab]();
    root.innerHTML = String(html`${header()}<div class="account-layout"><nav class="account-nav" aria-label="Account">${[['orders', 'My orders'], ['profile', 'Profile'], ['addresses', 'Addresses']].map(([k, l]) => html`<button type="button" data-nav="${k}" class="${tab === k ? 'is-active' : ''}">${l}</button>`)}<a class="btn btn--ghost btn--sm" href="/wishlist" style="margin-top:8px">My wishlist</a></nav><div>${body}</div></div>`);
    bind();
  }

  function bind() {
    $$('[data-nav]', root).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.nav; history.replaceState(null, '', '#' + tab); render(); }));
    $('[data-logout]', root).addEventListener('click', async () => { await api('/auth/logout', { method: 'POST', body: {} }); location.href = '/'; });
    const prof = $('[data-profile]', root);
    prof?.addEventListener('submit', async (e) => {
      e.preventDefault();
      $$('[data-err]', prof).forEach((x) => { x.textContent = ''; });
      const fd = Object.fromEntries(new FormData(prof));
      try { user = (await api('/me', { method: 'PATCH', body: fd })).user; toast('Profile updated.'); render(); }
      catch (err) { for (const [k, m] of Object.entries(err.fields || {})) { const el = $(`[data-err="${k}"]`, prof); if (el) el.textContent = m; } if (!err.fields) toast(err.message, { type: 'error' }); }
    });
    const addr = $('[data-addr]', root);
    if (addr) {
      const fill = () => { addr.elements.district.innerHTML = (divisions[addr.elements.division.value] || []).map((d) => `<option>${esc(d)}</option>`).join(''); };
      addr.elements.division.addEventListener('change', fill); fill();
      addr.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(addr));
        if (!fd.area || !fd.address) { toast('Please fill in the area and full address.', { type: 'error' }); return; }
        try { user = (await api('/me', { method: 'PATCH', body: { addresses: [...(user.addresses || []), fd] } })).user; toast('Address saved.'); render(); } catch (err) { toast(err.message, { type: 'error' }); }
      });
    }
    $$('[data-del]', root).forEach((b) => b.addEventListener('click', async () => {
      const list = (user.addresses || []).filter((_, i) => i !== Number(b.dataset.del));
      try { user = (await api('/me', { method: 'PATCH', body: { addresses: list } })).user; render(); } catch (err) { toast(err.message, { type: 'error' }); }
    }));
  }
  render();
}
