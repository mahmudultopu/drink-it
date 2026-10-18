# Real product photos (optional)

The store's can images are rendered by `scripts/render` (photoreal 3D cans). If you have **real photos** of a product, drop
them here and they replace the render for that product — no code changes needed.

1. Name the file after the product handle, e.g. `coca-cola-original-250ml-can.jpg` (handles are in `data/products.json`,
   or the URL of the product page: `/products/<handle>`). `.png`, `.jpg` and `.webp` work.
2. Best results: the can upright and centred, a plain white or light backdrop, soft light, no hands, no hard shadows,
   at least ~1000 px tall. A transparent PNG is used as-is (no background removal needed).
3. Run `npm run render:products` (or `node scripts/render/render.mjs build <handle>` for one product). It cuts the can out,
   frames it, and builds the card / thumbnail / 6-pack / 12-pack / carton images from it.
4. `node scripts/build.mjs` is only needed if you changed the catalogue; otherwise just reload the site.

Where to get real packshots legally: ask the distributors for their product image packs — Coca-Cola Bangladesh Beverages,
Transcom Beverages (Pepsi / 7UP / Mirinda / Mountain Dew), Akij Food & Beverage (Mojo / Clemon / Speed) and so on — or
photograph the cans yourself. Do not copy photos from other shops' websites: they are copyrighted and their terms of use
forbid it.
