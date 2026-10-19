// Real-browser tests: they load the storefront in headless Chrome against the real server, so they catch what the HTTP
// tests cannot - script errors, Content-Security-Policy violations, broken rendering and layout shifts.
// The suites live in support/browser-suites.mjs, because build.test.mjs runs them again against the production build.
// They are skipped when no Chrome or Chromium is installed (set CHROME_PATH to point at one).
import { before, after } from 'node:test';
import puppeteer from 'puppeteer-core';
import { findChromeOrNull } from '../scripts/chrome.mjs';
import { startServer } from './support/server.mjs';
import { registerBrowserSuites } from './support/browser-suites.mjs';

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

registerBrowserSuites({ skip, browser: () => browser, base: () => server.base });
