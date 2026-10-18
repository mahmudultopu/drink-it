import { $, initReveal } from '../ui.js';
import { Store } from '../store.js';
import { bannerHtml } from '../sections.js';

export function init() {
  $('[data-about-banner]').innerHTML = String(
    bannerHtml({
      title: 'About Us',
      text: 'At Drink it we’re all about one thing: making every cold can in Bangladesh easy to find, easy to order and easy to enjoy. From Coca-Cola to Mojo, Speed to Red Bull — it’s all here, delivered to your door.',
      cta: { href: '/collections', label: 'Shop by Categories' },
    }),
  );
  const n = $('[data-count]');
  if (n) n.textContent = `${Store.products.length}+`;
  initReveal();
}
