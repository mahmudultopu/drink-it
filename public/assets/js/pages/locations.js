// Delivery areas: the divisions we deliver to with their delivery times, and the fee table. All figures come from
// the delivery section of data/site.json, so changing a fee there changes this page too.
import { $, html, money, initReveal } from '../ui.js';
import { Store } from '../store.js';

export function init() {
  const d = Store.site.delivery;
  const zone = d.dhakaZone || ['Dhaka', 'Gazipur', 'Narayanganj'];
  $('[data-areas]').innerHTML = String(
    html`${Object.entries(Store.site.divisions).map(([name, districts]) => {
      const inside = name === 'Dhaka';
      const eta = inside ? d.etaDhaka : d.etaOutside;
      return html`<article class="area" data-reveal="up"><h3>${name}</h3><p>${districts.length} districts · ${districts.slice(0, 4).join(', ')}${districts.length > 4 ? '…' : ''}</p><span class="chip">${eta[0]}–${eta[1]} working days</span></article>`;
    })}`,
  );
  $('[data-fees]').innerHTML =
    String(html`<table><thead><tr><th>Delivery area</th><th>Charge</th><th>Estimated time</th></tr></thead><tbody>
    <tr><td>${zone.join(', ')}</td><td>${money(d.dhaka)}</td><td>${d.etaDhaka[0]}–${d.etaDhaka[1]} working days</td></tr>
    <tr><td>Everywhere else in Bangladesh</td><td>${money(d.outside)}</td><td>${d.etaOutside[0]}–${d.etaOutside[1]} working days</td></tr>
    <tr><td>Orders above ${money(d.freeOver)}</td><td><b>Free</b></td><td>Same as above</td></tr></tbody></table>`);
  initReveal();
}
