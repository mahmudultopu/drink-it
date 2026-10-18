# Drink it — Bangladesh's cold-can store

**Live preview:** <https://drink-it-drab.vercel.app> — a demo deployment on Vercel. Browse, add to cart and check out,
but orders are not saved there (see [Deploy](#deploy)).

Drink it is a complete online store for canned cold drinks in Bangladesh — Coca-Cola, Pepsi, Sprite, 7UP, Fanta,
Mirinda, Mountain Dew, Mojo, Clemon, Speed, Royal Tiger, Red Bull, Monster, imported cans and more. Customers buy
**from the Drink it website itself**: they pick singles, 6-packs, 12-packs or cartons of 24, check out with
cash on delivery, bKash, Nagad or Rocket, and the order lands in your admin dashboard.

The look follows the *Feezee* food-and-beverage theme you pointed me to: deep green `#11704B` + lime `#E0FA63`,
Young Serif headings with DM Sans text, chunky pill buttons with a teal drop edge, torn-paper edges, layered hill
and wave dividers, pastel product tiles, and both home layouts (**Home – Default** and **Home V2**). All code is
original — no theme files, images or code were copied. The can pictures are photoreal 3D renders made in-house (see
*Product images* below); swap in official packshots whenever you have them.

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
`DRINKIT_TRUST_PROXY=1` (when behind a reverse proxy), `DRINKIT_DATA_DIR` (where the JSON data lives; default
`data/`) and `DRINKIT_SECRET` (cookie-signing key; by default one is generated into `data/secret.key`).

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

**Storefront** (page templates in `views/`, CSS / JS / fonts / images in `public/assets/`): home (two layouts),
collections + filters/sorting, product page (gallery, pack picker, delivery estimate, reviews), cart drawer + cart
page, checkout, order confirmation, order tracking, accounts, wishlist, compare, search, blog, about, contact, FAQ,
delivery areas, policies, 404. Fully responsive with a mobile tab bar.

**Server** (`server.js`, `server/`): zero-dependency Node server. JSON API, static hosting with gzip, order pricing
re-checked on the server (client prices are never trusted), stock reservation, accounts (scrypt-hashed passwords,
signed cookies), rate limiting, strict Content-Security-Policy.

**Admin** (`/admin`): dashboard, orders (status flow, payment verification, CSV export, print slip), product price &
stock editing, review moderation, contact messages, newsletter subscribers, customers.

**Data** (`data/*.json`): plain JSON files — orders, users, reviews, subscribers, messages are written here by the
server. Back this folder up.

## Product images

Every can picture on the site (cards, product galleries, 6/12/24-can packs, cartons, category tiles, hero, banners and
blog covers) comes from `scripts/render`: a small three.js pipeline that draws aluminium cans with glossy printed bodies,
studio reflections and condensation, using label designs drawn in `scripts/render/page/labels.js` (including the
Bengali-script wordmarks of the Bangladeshi market cans). Rendering needs Chrome and runs on your GPU in about five minutes:

```
npm install                  # once: three.js, puppeteer-core, sharp (dev dependencies only)
npm run render               # all product images + scenes  -> public/assets/img/products, public/assets/img/scenes
npm run render:products      # products only   (node scripts/render/render.mjs build <handle> for just one)
npm run render:scenes        # hero / banner / blog scenes (defined in scripts/render/scenes.mjs)
```

The renders are *approximations* of the real packs. **Real photos win:** drop a photo named after the product handle into
`scripts/render/inbox/` (see the README there) and `npm run render:products` cuts it out and rebuilds all the pack images
from it. The best legal source for packshots is the brands' distributors; do not copy photos from other shops' sites.

## Changing the catalogue

Products, pack discounts, collections and copy are defined in `scripts/catalog.mjs` and `scripts/content.mjs`
(each category's tile can is its `lead` product). Then:

```
npm run render:products   # only for new / changed cans or label designs
npm run build:catalog
```

`build:catalog` regenerates `data/products.json`, `data/collections.json`, blog/FAQ/policy data and the small vector
shapes in `public/assets/img/` (badges, logo, fruit icons, avatars). **Warning:** it resets product stock and prices to
the values in `scripts/catalog.mjs`, so do it before you start taking orders (or copy your edits into the script).
Existing customer reviews are never overwritten.

## Deploy

**On a server with a persistent disk** (a VPS, Railway/Render with a disk, your own PC…): run `npm start` behind
HTTPS and set `PORT`, `DRINKIT_SECURE_COOKIES=1` and `DRINKIT_TRUST_PROXY=1`. Orders, accounts and reviews are saved
in `data/` — back that folder up. This is the setup to use for a shop that takes real orders.

**On Vercel (preview only).** Import the repo as-is: `vercel.json` serves `public/assets/` from the CDN and sends
everything else to the serverless function in `api/index.js`, which runs the same handlers as `server.js`. A
serverless function has no persistent disk, so there the store starts from the catalogue in `data/` and keeps
whatever is written at run time (orders, accounts, reviews, stock changes) in `/tmp` — it is **lost on a cold start
and not shared between instances**. The site says so in its announcement bar. Use it to show the store off; for real
orders use a host with a disk, or swap the storage in `server/db.js` for a database.

Environment variables for Vercel (Project → Settings → Environment Variables):

| Variable | Purpose |
| --- | --- |
| `DRINKIT_ADMIN_PASSWORD` | Turns on the `/admin` login (it stays closed on Vercel until you set this). |
| `DRINKIT_SECRET` | Any long random string; keeps login cookies valid across server instances. |

## Notes & limits

* **Payments:** cash on delivery works out of the box. bKash / Nagad / Rocket use the common "Send Money + TrxID"
  flow: the customer pays your number, enters the transaction ID, and you mark the payment *paid* in the admin after
  checking. Card payments are shown as "coming soon" — connect a gateway such as SSLCommerz in `server/routes.js`.
* **Notifications:** the store does not send email/SMS. New orders appear in the admin; the dashboard badge shows
  how many are waiting.
* **Sample content:** the product reviews seeded in `data/reviews.json` (flagged `"sample": true`), the three
  testimonials on the home page and the crew names on the About page are placeholders — replace them with real ones
  (home-page testimonials: `public/assets/js/pages/home.js`).
  Brand names, logos and pack designs appear only to identify the products for sale; the can images are in-house 3D
  renders that approximate the real packs, not official packshots.
* **Hosting:** the server keeps data in local files, so a shop that takes real orders needs a machine with a
  persistent disk (see *Deploy* above); serverless platforms such as Vercel are fine for previews only.

## Credits

Fonts: Young Serif and DM Sans (SIL Open Font License), self-hosted in `public/assets/fonts/`.
Can-label fonts (all SIL Open Font License, from Google Fonts, in `scripts/fonts/`): Poppins, Anton, Lilita One, Righteous,
Pacifico, Lobster, Russo One, Bungee, Bebas Neue, Oswald, Fredoka, Young Serif, Galada, Hind Siliguri, Atma, Baloo Da 2
and Tiro Bangla. Rendering uses [three.js](https://threejs.org) (MIT).
