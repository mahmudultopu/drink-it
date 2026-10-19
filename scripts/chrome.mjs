// Locate a Chrome or Chromium binary for the tools that drive a headless browser (the can renderer and the
// browser tests). Set CHROME_PATH to use a specific one.
import fs from 'node:fs';
import path from 'node:path';

/** Path of an installed Chrome, Chromium or Edge, or null when none is found. */
export function findChromeOrNull() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** Like findChromeOrNull(), but throws a helpful error when there is no browser. */
export function findChrome() {
  const found = findChromeOrNull();
  if (!found) throw new Error('Chrome/Chromium not found. Install Chrome or set CHROME_PATH.');
  return found;
}
