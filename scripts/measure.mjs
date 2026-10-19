/* global window -- the evaluate() callbacks below run inside the page, not in Node */
// Loads a page in headless Chrome under throttling and reports what a visitor would feel: first and largest paint, layout
// shift, main-thread time and bytes transferred. Giving it two servers runs them alternately, so slow moments of the
// machine hit both equally - use that to compare a change against the original.
//
//   node scripts/measure.mjs <base-url> [<other-base-url>] <path> [--runs 5] [--device mobile|desktop]
//   node scripts/measure.mjs http://localhost:3000 /products/sprite-250ml-can
//   node scripts/measure.mjs http://localhost:3001 http://localhost:3000 /          (A = first, B = second)
//
// mobile: 412x823 at 2.6x, CPU slowed 4x, 1.6 Mbit/s with 150 ms latency (Lighthouse's "slow 4G" profile).
// desktop: 1350x940, no throttling. The cache is disabled so every run is a first visit. Timings are medians.
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};
const runs = Number(option('runs', 5));
const device = option('device', 'mobile');
const positional = args;
const path = positional.pop();
const bases = positional;
if (!path?.startsWith('/') || !bases.length || !['mobile', 'desktop'].includes(device)) {
  console.error(
    'usage: node scripts/measure.mjs <base-url> [<other-base-url>] <path> [--runs 5] [--device mobile|desktop]',
  );
  process.exit(2);
}

const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

/** One first-visit load of `base + path`. */
async function measureOnce(base) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (device === 'mobile') {
    await page.setViewport({ width: 412, height: 823, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  } else {
    await page.setViewport({ width: 1350, height: 940 });
  }

  let bytes = 0;
  let requests = 0;
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
    requests++;
  });
  await page.evaluateOnNewDocument(() => {
    try {
      // keep the welcome pop-up and the "someone just ordered" toast out of the measurement
      sessionStorage.setItem('drinkit.popup', '1');
      sessionStorage.setItem('drinkit.act', '1');
    } catch {
      /* ignore */
    }
    window.__vitals = { cls: 0, lcp: 0, fcp: 0, lcpElement: '' };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__vitals.lcp = e.startTime;
        window.__vitals.lcpElement =
          `${e.element?.tagName ?? '?'} ${(e.url || '').split('/').pop().split('?')[0]}`.trim();
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__vitals.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
  });

  await page.goto(base + path, { waitUntil: 'networkidle0', timeout: 120_000 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const vitals = await page.evaluate(() => window.__vitals);
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await context.close();
  return {
    ...vitals,
    bytes,
    requests,
    scriptMs: metrics.ScriptDuration * 1000,
    layoutMs: (metrics.LayoutDuration + metrics.RecalcStyleDuration) * 1000,
    taskMs: metrics.TaskDuration * 1000,
  };
}

const results = bases.map(() => []);
for (let i = 0; i < runs; i++) {
  for (const [k, base] of bases.entries()) results[k].push(await measureOnce(base));
}
await browser.close();

const row = (label, list) => ({
  server: label,
  'FCP ms': Math.round(median(list.map((r) => r.fcp))),
  'LCP ms': Math.round(median(list.map((r) => r.lcp))),
  CLS: +median(list.map((r) => r.cls)).toFixed(3),
  'main thread ms': Math.round(median(list.map((r) => r.taskMs))),
  'style+layout ms': Math.round(median(list.map((r) => r.layoutMs))),
  'script ms': Math.round(median(list.map((r) => r.scriptMs))),
  'KB over wire': Math.round(median(list.map((r) => r.bytes)) / 1024),
  requests: Math.round(median(list.map((r) => r.requests))),
});

console.log(`${path} - ${device}, median of ${runs}`);
console.table(bases.map((base, k) => row(`${'AB'[k] ?? k + 1} ${base}`, results[k])));
for (const [k, base] of bases.entries()) {
  console.log(
    `LCP element ${'AB'[k] ?? k + 1} (${base}): ${[...new Set(results[k].map((r) => r.lcpElement))].join(' | ')}`,
  );
}
