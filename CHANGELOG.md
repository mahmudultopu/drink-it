# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org).

## [1.0.0] - 2026-10-19

First release: a complete shop with an admin dashboard, hardened, measured and documented.

### Added

- Storefront: two home layouts, collections with URL-backed filters and sorting, product pages with pack sizes and a
  delivery estimate, cart drawer and page, checkout for Bangladeshi addresses, order tracking, accounts with saved
  addresses, wishlist, compare, search, blog, FAQ, delivery areas, policy pages and contact form.
- Admin dashboard: orders with a status flow and payment verification, CSV export, price and stock editing, review
  moderation, messages, subscribers and customers.
- Photoreal can images rendered with three.js (`npm run render`), with a drop-in folder for real photos.
- Production asset build (`npm run build`): bundled, minified, per-page chunks, content-hashed file names and image URLs,
  and a manifest the server uses to serve it.
- Test suite on Node's built-in runner: unit tests, end-to-end API tests against the real server, build tests and
  real-browser tests (page loads under the Content-Security-Policy, layout stability, the purchase flow).
- Continuous integration (lint, formatting, tests on Node 20, 22 and 24, a production-build check and a dependency
  audit), Dependabot, issue and pull-request templates.
- Documentation: README, architecture notes, performance notes, contributing guide and security policy.
- `npm run measure` for repeatable page-load measurements and `npm run screenshots` for the README images.

### Security

- Passwords are hashed with scrypt, with the cost stored per hash so it can be raised later; hashing is asynchronous and
  limited in concurrency.
- Sessions are typed, signed, expiring tokens in `HttpOnly`, `SameSite=Lax` cookies (`__Host-` and `Secure` over HTTPS);
  admin sessions end when the admin password changes.
- Login attempts are limited per visitor and per account; unknown accounts cost the same hashing work as wrong passwords.
- Cross-site requests that change state are refused (Fetch Metadata and Origin checks, JSON-only bodies).
- The client address comes from the configured number of trusted proxies rather than from a spoofable header; IPv6
  clients are rate limited by /64.
- A customer can only list orders placed from their own account; internal fields never leave the server.
- Spreadsheet formulas in the CSV export are neutralised; transaction IDs cannot be reused; the welcome coupon is limited
  to one use per phone number; the size of one order is capped.
- Strict Content-Security-Policy (no inline scripts except one hashed snippet), frame, opener and resource policies,
  HSTS over HTTPS, request timeouts, graceful shutdown, atomic owner-only data files.

### Performance

- Pages carry their banner, title, meta tags and main product photo in the first HTML.
- Right-sized images: 192 px pack thumbnails and `srcset` for hero, banner and blog images; the second photo of a
  product card loads on hover.
- Brotli and gzip, `ETag` and `304` responses, one-year immutable caching for fingerprinted assets, edge-cacheable
  HTML and catalogue.
- No layout shift on the main pages (the collection page went from 1.04 to 0).
- On a throttled phone: home page 1,143 KB to 374 KB, product page largest paint 5.2 s to 1.5 s.
- Lighthouse on the live site: performance 98-100 (was 75-100), accessibility 100 (was 88-98), SEO 100 (was 92-100).

### Fixed

- The Print buttons on the order page and in the admin dashboard were blocked by the Content-Security-Policy.
- The call-to-action banner was never shown on product pages.
- A malformed percent-escape in a product, article or order address caused an error instead of a clean "not found".
- Colour contrast, touch-target size, heading order and ARIA misuse flagged by an accessibility audit.
