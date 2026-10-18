// Entry point: loads the catalogue, starts the shared chrome and then the page-specific module.
import { bootstrap } from './api.js';
import { Store } from './store.js';
import { initChrome } from './chrome.js';
import { startCountdowns, initReveal, toast } from './ui.js';

async function main() {
  let boot;
  try {
    boot = await bootstrap();
  } catch (err) {
    document.querySelector('main')?.insertAdjacentHTML('afterbegin', `<div class="container" style="padding:80px 20px;text-align:center"><h2>We can’t reach the store right now</h2><p>${err.message}</p><p><button class="btn" onclick="location.reload()">Try again</button></p></div>`);
    return;
  }
  Store.init(boot);
  const chrome = initChrome();
  const page = document.body.dataset.page;
  try {
    const mod = await import(`./pages/${page}.js`);
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
