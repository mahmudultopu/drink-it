// About page. The text and banner are in views/about.html; this fills in the live product count.
import { $, initReveal } from '../ui.js';
import { Store } from '../store.js';

export function init() {
  const n = $('[data-count]');
  if (n) n.textContent = `${Store.products.length}+`;
  initReveal();
}
