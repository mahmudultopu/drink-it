# Scripts

Tooling that is not part of the running shop. Everything here is run through `npm run <name>` (see `package.json`).

| File               | npm script               | Purpose                                                                                           |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `build-assets.mjs` | `build`                  | Bundles and fingerprints the front end into `public/assets/dist` and writes the manifest          |
| `catalog.mjs`      | `build:catalog`          | Source of the catalogue (products, packs, prices, collections); `build.mjs` turns it into JSON    |
| `content.mjs`      |                          | Source of the blog posts, FAQ and policy pages                                                    |
| `build.mjs`        | `build:catalog`          | Writes `data/*.json` and the small vector art in `public/assets/img`. **Resets stock and prices** |
| `seed.mjs`         |                          | Adds clearly marked sample reviews (only when `data/reviews.json` does not exist)                 |
| `get-fonts.mjs`    | `build:fonts`            | Downloads the self-hosted web fonts and writes their `@font-face` rules                           |
| `measure.mjs`      | `measure`                | Page-load measurements under throttling, for comparing two versions of the shop                   |
| `screenshots.mjs`  | `screenshots`            | Regenerates the README screenshots                                                                |
| `chrome.mjs`       |                          | Finds an installed Chrome or Chromium for the tools that drive a browser                          |
| `art/`             |                          | Generators for the vector shapes, badges, logo and team avatars                                   |
| `render/`          | `render`, `build:images` | The three.js can renderer, the real-photo importer and the responsive image sizes                 |
| `fonts/`           |                          | Font files the can-label renderer draws with (SIL Open Font License)                              |

## The catalogue

`catalog.mjs` is the single source for products. After editing it:

```bash
npm run render:products   # only for new or changed cans and label designs
npm run build:catalog     # regenerate data/products.json and data/collections.json
```

`build:catalog` resets product stock and prices to the values in `catalog.mjs`, so run it before the shop takes orders (or
copy edits made in the dashboard back into the file). Customer reviews are never overwritten.

## Rendering the can images

`render/` needs Chrome (or Chromium, or Edge; set `CHROME_PATH` if it is not found) and a GPU for reasonable speed.

```bash
npm run render             # every product image and every scene
npm run render:products    # products only; add a handle to render just one:
node scripts/render/render.mjs build coca-cola-original-250ml-can
npm run render:scenes      # hero, banner and blog scenes (defined in render/scenes.mjs)
npm run build:images       # the smaller copies the site serves to phones and small slots
```

`npm run render` already finishes with `build:images`. Output goes to `public/assets/img/products` and
`public/assets/img/scenes`. To use a real photo for a product, follow [render/inbox/README.md](render/inbox/README.md).
