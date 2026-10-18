import { $, initReveal } from '../ui.js';
import { Store } from '../store.js';

export function init() {
  const n = $('[data-count]');
  if (n) n.textContent = `${Store.products.length}+`;
  initReveal();
}
