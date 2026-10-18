// Entry point of every storefront page: load the catalogue, start the shared chrome (header, cart drawer, search...)
// and then the module for the page being shown.
import { bootstrap } from './api.js';
import { Store } from './store.js';
import { initChrome } from './chrome.js';
import { startCountdowns, initReveal, toast } from './ui.js';

// One loader per page, keyed by <body data-page>. The paths are written out (rather than built from the page name) so
// the bundler can see every module and split each one into its own chunk, loaded only on the pages that need it.
const PAGES = {
  about: () => import('./pages/about.js'),
  account: () => import('./pages/account.js'),
  article: () => import('./pages/article.js'),
  blog: () => import('./pages/blog.js'),
  cart: () => import('./pages/cart.js'),
  checkout: () => import('./pages/checkout.js'),
  collection: () => import('./pages/collection.js'),
  collections: () => import('./pages/collections.js'),
  compare: () => import('./pages/compare.js'),
  contact: () => import('./pages/contact.js'),
  faq: () => import('./pages/faq.js'),
  home: () => import('./pages/home.js'),
  home2: () => import('./pages/home2.js'),
  locations: () => import('./pages/locations.js'),
  login: () => import('./pages/login.js'),
  notfound: () => import('./pages/notfound.js'),
  order: () => import('./pages/order.js'),
  policy: () => import('./pages/policy.js'),
  product: () => import('./pages/product.js'),
  search: () => import('./pages/search.js'),
  track: () => import('./pages/track.js'),
  wishlist: () => import('./pages/wishlist.js'),
};

/** Replace the page content with a retry prompt when the catalogue cannot be loaded. */
function showLoadError(error) {
  const box = document.createElement('div');
  box.className = 'container load-error';
  const title = document.createElement('h2');
  title.textContent = 'We can’t reach the store right now';
  const detail = document.createElement('p');
  detail.textContent = error.message;
  const retry = document.createElement('button');
  retry.className = 'btn';
  retry.type = 'button';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => location.reload());
  box.append(title, detail, retry);
  (document.querySelector('main') || document.body).prepend(box);
}

async function main() {
  let boot;
  try {
    boot = await bootstrap();
  } catch (err) {
    showLoadError(err);
    document.documentElement.classList.add('is-ready');
    return;
  }
  Store.init(boot);
  const chrome = initChrome();
  const page = document.body.dataset.page;
  try {
    const load = Object.hasOwn(PAGES, page) ? PAGES[page] : PAGES.notfound;
    const mod = await load();
    await mod.init?.({ boot, chrome });
  } catch (err) {
    console.error(`Page "${page}" failed to start:`, err);
    toast('Something went wrong loading this page. Please refresh.', { type: 'error' });
  }
  startCountdowns();
  initReveal();
  document.documentElement.classList.add('is-ready');
}
main();
