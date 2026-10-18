// Security headers for HTML documents, and the one inline script they have to allow.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './db.js';
import { BASE_HEADERS, SECURE } from './util.js';
import { manifest } from './assets.js';

/**
 * The small script that runs before first paint (see public/assets/js/boot.js) is inlined into every page so it costs
 * no request. The Content-Security-Policy allows exactly that script, by hash; no other inline script can run.
 */
export const bootScript =
  manifest?.inline?.boot ?? fs.readFileSync(path.join(ROOT, 'public/assets/js/boot.js'), 'utf8');
const bootHash = crypto.createHash('sha256').update(bootScript).digest('base64');

// Content-Security-Policy: everything is served from our own origin, so nothing else is allowed to run or load.
//  - Inline `style="..."` attributes are allowed (the templates position decorative elements with them) but <style>
//    blocks are not.
//  - frame-ancestors 'none' stops the site being embedded in other pages (clickjacking).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  `script-src 'self' 'sha256-${bootHash}'`,
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  ...(SECURE ? ['upgrade-insecure-requests'] : []),
].join('; ');

/** Headers for every HTML document, on top of the ones all responses carry. */
export const DOCUMENT_HEADERS = {
  ...BASE_HEADERS,
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};
