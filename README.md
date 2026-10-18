# Drink it — Bangladesh's cold-can store

Drink it is a complete online store for canned cold drinks in Bangladesh — Coca-Cola, Pepsi, Sprite, 7UP, Fanta,
Mirinda, Mountain Dew, Mojo, Clemon, Speed, Royal Tiger, Red Bull, Monster, imported cans and more. Customers buy
**from the Drink it website itself**: they pick singles, 6-packs, 12-packs or cartons of 24, check out with
cash on delivery, bKash, Nagad or Rocket, and the order lands in your admin dashboard.

The look follows the *Feezee* food-and-beverage theme you pointed me to: deep green `#11704B` + lime `#E0FA63`,
Young Serif headings with DM Sans text, chunky pill buttons with a teal drop edge, torn-paper edges, layered hill
and wave dividers, pastel product tiles, and both home layouts (**Home – Default** and **Home V2**). All code and
artwork here is original — no theme files, images or code were copied.

## Run it

You need [Node.js 20+](https://nodejs.org). There is nothing to install for the store itself.

```
npm start          (or double-click start.bat)
```

Open <http://localhost:3000>. The admin area is <http://localhost:3000/admin>.

On the **first run** the console prints a random admin password once. Forgot it later?
`node server.js --reset-admin` prints a new one. (Or set the `DRINKIT_ADMIN_PASSWORD` environment variable.)

Other settings (environment variables): `PORT` (default 3000), `HOST` (default `127.0.0.1`; use `0.0.0.0` to open
the store from your phone on the same Wi-Fi), `DRINKIT_SECURE_COOKIES=1` (when served over HTTPS),
`DRINKIT_TRUST_PROXY=1` (when behind a reverse proxy).

## Before you go live — replace the placeholders

Edit **`data/site.json`** (it is picked up immediately, no restart):

| What | Where |
| --- | --- |
| Phone, WhatsApp, email, address, opening hours | `contact` |
| bKash / Nagad / Rocket merchant numbers | `payments.bkash.number` … (currently `01XXX-XXXXXX`) |
| Delivery charges, free-delivery threshold, ETAs | `delivery` |
| Announcement-bar messages | `announcements` |
| Social links | `social` |

Coupons live in `data/coupons.json` (`WELCOME50`, `DRINKIT10`, `FREESHIP`).

> The store shows prices in Bangladeshi Taka (৳). Prices are *indicative* (based on recent Bangladeshi retail
> listings) — set your real prices in the admin → Products tab, or in `scripts/catalog.mjs`.

## What's inside

**Storefront** (`public/`): home (two layouts), collections + filters/sorting, product page (gallery, pack picker,
delivery estimate, reviews), cart drawer + cart page, checkout, order confirmation, order tracking, accounts,
wishlist, compare, search, blog, about, contact, FAQ, delivery areas, policies, 404. Fully responsive with a mobile
tab bar.

**Server** (`server.js`, `server/`): zero-dependency Node server. JSON API, static hosting with gzip, order pricing
re-checked on the server (client prices are never trusted), stock reservation, accounts (scrypt-hashed passwords,
signed cookies), rate limiting, strict Content-Security-Policy.

**Admin** (`/admin`): dashboard, orders (status flow, payment verification, CSV export, print slip), product price &
stock editing, review moderation, contact messages, newsletter subscribers, customers.

**Data** (`data/*.json`): plain JSON files — orders, users, reviews, subscribers, messages are written here by the
server. Back this folder up.

## Changing the catalogue or artwork

Products, pack discounts, collections and copy are defined in `scripts/catalog.mjs` and `scripts/content.mjs`.
Run `npm install` once (it fetches `opentype.js`, used only for drawing the vector can art), then:

```
npm run build:catalog
```

This regenerates `data/products.json`, `data/collections.json`, blog/FAQ/policy data and every illustration in
`public/assets/img/` (cans, packs, scenes, badges, logo). **Warning:** it resets product stock and prices to the
values in `scripts/catalog.mjs`, so do it before you start taking orders (or copy your edits into the script).
Existing customer reviews are never overwritten.

To use real product photos instead of the illustrated cans, drop images into `public/assets/img/` and change the
`images` paths in `data/products.json`.

## Notes & limits

* **Payments:** cash on delivery works out of the box. bKash / Nagad / Rocket use the common "Send Money + TrxID"
  flow: the customer pays your number, enters the transaction ID, and you mark the payment *paid* in the admin after
  checking. Card payments are shown as "coming soon" — connect a gateway such as SSLCommerz in `server/routes.js`.
* **Notifications:** the store does not send email/SMS. New orders appear in the admin; the dashboard badge shows
  how many are waiting.
* **Sample content:** the product reviews seeded in `data/reviews.json` (flagged `"sample": true`), the three
  testimonials on the home page and the crew names on the About page are placeholders — replace them with real ones
  (home-page testimonials: `public/assets/js/pages/home.js`).
  Brand names are used only to describe products for sale; the can illustrations are original artwork.
* **Hosting:** the server keeps data in local files, so host it on a machine with a persistent disk (a VPS, Railway/
  Render with a disk, etc.), not a read-only serverless platform.

## Credits

Fonts: Young Serif and DM Sans (SIL Open Font License), self-hosted in `public/assets/fonts/`.
