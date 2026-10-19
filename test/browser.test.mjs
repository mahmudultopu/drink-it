// Real-browser tests: they load the storefront in headless Chrome against the real server, so they catch what the HTTP
// tests cannot - script errors, Content-Security-Policy violations, broken rendering and layout shifts.
// They are skipped when no Chrome or Chromium is installed (set CHROME_PATH to point at one).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { findChromeOrNull } from '../scripts/chrome.mjs';
import { startServer } from './support/server.mjs';

const chrome = findChromeOrNull();
const skip = chrome ? false : 'Chrome or Chromium not found (set CHROME_PATH)';

let server;
let browser;

before(async () => {
  if (skip) return;
  server = await startServer();
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

/** Open `path` in a fresh page, collecting console errors, script errors and CSP violations. */
async function open(path, { width = 1280, height = 900, wait = 'networkidle0' } = {}) {
  const context = await browser.createBrowserContext(); // its own storage and cache, like a new visitor
  const page = await context.newPage();
  await page.setViewport({ width, height });
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`script error: ${e.message}`));
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText;
    if (reason !== 'net::ERR_ABORTED') problems.push(`request failed: ${r.url()} ${reason}`); // aborted = navigated away
  });
  await page.evaluateOnNewDocument(() => {
    // keep the welcome pop-up and the "someone just ordered" toasts out of the way
    try {
      sessionStorage.setItem('drinkit.popup', '1');
      sessionStorage.setItem('drinkit.act', '1');
    } catch {
      /* ignore */
    }
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`),
    );
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(server.base + path, { waitUntil: wait });
  await new Promise((resolve) => setTimeout(resolve, 400)); // let late work (reveal animations, popups) settle
  const csp = await page.evaluate(() => window.__csp);
  problems.push(...csp.map((v) => `CSP: ${v}`));
  return { page, problems, cls: () => page.evaluate(() => window.__cls), close: () => context.close() };
}

const PAGES = [
  '/',
  '/home-2',
  '/collections',
  '/collections/all',
  '/collections/cola-classics',
  '/products/coca-cola-original-250ml-can',
  '/cart',
  '/checkout',
  '/track',
  '/wishlist',
  '/compare',
  '/search?q=cola',
  '/account/login',
  '/blogs/news',
  '/pages/about-us',
  '/pages/contact',
  '/pages/faq',
  '/pages/our-locations',
  '/pages/shipping-policy',
  '/admin',
];

describe('pages in a real browser', { skip }, () => {
  for (const path of PAGES) {
    it(`${path} loads without errors or policy violations`, async () => {
      const { page, problems, close } = await open(path);
      assert.deepEqual(problems, []);
      assert.ok((await page.$eval('body', (b) => b.innerText.trim().length)) > 50, 'the page has content');
      await close();
    });
  }

  it('shows a friendly 404 page', async () => {
    const page = await browser.newPage();
    const res = await page.goto(`${server.base}/no/such/page`);
    assert.equal(res.status(), 404);
    assert.match(await page.$eval('h1', (h) => h.textContent), /empty/i);
    await page.close();
  });
});

describe('layout stability', { skip }, () => {
  // content that arrives after the first paint must not push visible content around
  for (const path of [
    '/',
    '/collections',
    '/collections/cola-classics',
    '/products/sprite-250ml-can',
    '/cart',
    '/search?q=cola',
  ]) {
    for (const [name, size] of [
      ['desktop', { width: 1280, height: 900 }],
      ['phone', { width: 390, height: 780 }],
    ]) {
      it(`${path} on a ${name} shifts less than 0.05`, async () => {
        const { cls, close } = await open(path, size);
        assert.ok((await cls()) < 0.05, `layout shift was ${await cls()}`);
        await close();
      });
    }
  }
});

describe('server-rendered banner', { skip }, () => {
  it('is already on screen before any script has run', async () => {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.goto(`${server.base}/collections/cola-classics`);
    assert.equal(await page.$eval('.banner h1', (h) => h.textContent), 'Cola Classics');
    assert.ok(await page.$eval('.banner img', (img) => img.complete && img.naturalWidth > 0));
    await page.close();
  });
});

describe('product page', { skip }, () => {
  it('keeps the server-rendered photo and lets visitors browse the gallery and choose a pack', async () => {
    const { page, problems, close } = await open('/products/coca-cola-original-250ml-can');
    await page.waitForSelector('[data-pack="pack6"]'); // the page script has rendered the buy box
    const photo = () => page.$eval('[data-g-main]', (img) => img.getAttribute('src').split('?')[0].split('/').pop());

    assert.equal(await page.$$eval('.gallery__main > img', (l) => l.length), 1, 'exactly one main photo');
    assert.equal(await photo(), 'coca-cola-original-250ml-can.webp');
    assert.equal(await page.$$eval('.skeleton', (l) => l.length), 0, 'placeholders are gone');

    await page.click('[data-g-next]');
    await page.waitForFunction(() => document.querySelector('[data-g-main]').src.includes('-angle'));
    await page.click('[data-g-thumb="3"]');
    await page.waitForFunction(() => document.querySelector('[data-g-main]').src.includes('-pack12'));

    await page.click('[data-pack="pack6"]');
    await page.click('[data-inc]');
    assert.match(await page.$eval('[data-add] span', (s) => s.textContent), /Add to cart · ৳798/);
    await page.click('[data-add]');
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('drinkit.cart.v1')));
    assert.deepEqual(cart, [{ handle: 'coca-cola-original-250ml-can', pack: 'pack6', qty: 2 }]);
    assert.deepEqual(problems, []);
    await close();
  });

  it('marks only the pack buttons as radios and hides the sticky bar from the keyboard until it shows', async () => {
    const { page, close } = await open('/products/coca-cola-original-250ml-can');
    await page.waitForSelector('[data-stickybar]');
    assert.equal(await page.$$eval('article.pcard[aria-checked]', (l) => l.length), 0);
    assert.equal(await page.$eval('[data-stickybar]', (el) => el.inert), true);
    await close();
  });
});

describe('buying something', { skip }, () => {
  it('works from the product page to the order confirmation', async () => {
    const { page, problems, close } = await open('/products/sprite-250ml-can');
    await page.waitForSelector('[data-pack="pack6"]');
    await page.click('[data-pack="pack6"]');
    await page.click('[data-inc]'); // two 6-packs: enough for the welcome coupon's minimum order
    await page.click('[data-add]');
    await page.waitForFunction(() => document.querySelector('#cart-drawer')?.classList.contains('is-open'));

    await page.goto(`${server.base}/checkout`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#c-name');
    await page.type('#c-name', 'Browser Test');
    await page.type('#c-phone', '01799990001');
    await page.select('#c-div', 'Dhaka');
    await page.waitForFunction(() => document.querySelectorAll('#c-dist option').length > 1); // filled once a division is chosen
    await page.select('#c-dist', 'Dhaka');
    await page.type('#c-area', 'Gulshan');
    await page.type('#c-addr', 'House 7, Road 3, Gulshan');
    await page.type('[data-coupon]', 'WELCOME50');
    await page.click('[data-apply]');
    await page.waitForFunction(() => /Discount/.test(document.querySelector('[data-summary]').textContent));

    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('[data-submit]')]);
    assert.match(page.url(), /\/orders\/DI-\d{6}-[A-Z2-9]{4}$/);
    assert.match(await page.$eval('.thanks h1', (h) => h.textContent), /Thank you, Browser/);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('drinkit.cart.v1') || '[]').length), 0);

    // an inline onclick would be blocked by the Content-Security-Policy; the button has to work without one
    await page.evaluate(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    await page.click('[data-print]');
    assert.equal(await page.evaluate(() => window.__printed), true, 'the Print button opens the print dialog');
    assert.deepEqual(problems, []);
    await close();
  });
});

describe('search', { skip }, () => {
  it('finds the same cans, in the same order, from the overlay and from the results page', async () => {
    const home = await open('/');
    await home.page.keyboard.press('/'); // the keyboard shortcut for search
    await home.page.waitForSelector('#search-modal.is-open');
    // the overlay focuses its input a moment after it opens; typing before that would go nowhere
    await home.page.waitForFunction(() => document.activeElement?.matches('[data-search-input]'));
    await home.page.type('[data-search-input]', 'zero sugar');
    await home.page.waitForSelector('.sres__list .sres');
    const overlay = await home.page.$$eval('.sres__list .sres b', (els) => els.map((e) => e.textContent));
    assert.ok(overlay.length >= 2 && overlay.length <= 6, `${overlay.length} suggestions`);
    await home.close();

    const results = await open('/search?q=zero%20sugar');
    const titles = await results.page.$$eval('.pcard__title', (els) => els.map((e) => e.textContent.trim()));
    assert.deepEqual(titles.slice(0, overlay.length), overlay);
    assert.match(
      await results.page.$eval('[data-search-title]', (e) => e.textContent),
      /\d+ results? for “zero sugar”/,
    );
    await results.close();
  });

  it('offers a way out when nothing matches', async () => {
    const { page, close } = await open('/search?q=zzzz');
    assert.match(await page.$eval('[data-search-results]', (e) => e.textContent), /No cans found/);
    await close();
  });
});
