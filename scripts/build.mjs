// Build step: generates data/products.json, data/collections.json and the small vector shapes under public/assets/img.
// (Can images come from `npm run render` - scripts/render.)
// Run with:  npm run build:catalog
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProducts, COLLECTIONS, PACKS } from './catalog.mjs';
import { tileColor, mix, hex2rgb } from './art/lib.mjs';
import {
  tornEdgeSvg,
  waveSvg,
  hillsSvg,
  badgeSvg,
  playBadgeSvg,
  logoSvg,
  faviconSvg,
  fruitSvg,
  starsSvg,
  blobSvg,
  iceCubeSvg,
  bubbleSvg,
} from './art/shapes.mjs';
import { avatarSvg } from './art/avatars.mjs';
import { POSTS, FAQ, PAGES } from './content.mjs';
import { seedReviews } from './seed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const imgDir = path.join(root, 'public', 'assets', 'img');
const productsDir = path.join(imgDir, 'products');
fs.mkdirSync(dataDir, { recursive: true });

const chroma = (hex) => {
  const c = hex2rgb(hex);
  return Math.max(...c) - Math.min(...c);
};
// a can whose body is white-ish or near-black (dark and colourless) is tinted by its accent colour instead
const usesAccent = (a) => luminance(a.body) > 205 || (luminance(a.body) < 60 && chroma(a.body) < 45);
const luminance = (hex) => {
  const [r, g, b] = hex2rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// ---------- products + can images ----------
// The photoreal can images come from the 3D renderer (npm run render) or from real photos dropped in scripts/render/inbox.
const products = buildProducts();
const missing = [];
for (const p of products) {
  const a = p.art;
  p.tile = tileColor(usesAccent(a) ? (luminance(a.body) > 205 ? a.accent : mix(a.accent, '#888888', 0.4)) : a.body);
  p.ink = mix(usesAccent(a) ? a.accent : a.body, '#000000', 0.18); // readable title colour for this can's tiles
  const base = `/assets/img/products/${p.handle}`;
  p.images = {
    single: `${base}.webp`,
    card: `${base}-card.webp`,
    thumb: `${base}-thumb.webp`,
    angle: `${base}-angle.webp`,
    pack6: `${base}-pack6.webp`,
    pack12: `${base}-pack12.webp`,
    pack24: `${base}-pack24.webp`,
    // small copies of the pack photos for swatches and cart lines (made by scripts/render/derive.mjs)
    small: {
      pack6: `${base}-pack6-sm.webp`,
      pack12: `${base}-pack12-sm.webp`,
      pack24: `${base}-pack24-sm.webp`,
    },
  };
  if (!fs.existsSync(path.join(productsDir, `${p.handle}.webp`))) missing.push(p.handle);
  delete p.render; // renderer-only settings
}
if (missing.length)
  console.warn(`
  ! ${missing.length} product image(s) missing - run "npm run render" first (first: ${missing[0]})
`);
fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify(products, null, 1));

// ---------- collections (with a representative can for each) ----------
const collections = COLLECTIONS.map((c) => {
  const items = products.filter((p) => p.collections.includes(c.handle));
  const lead = items.find((p) => p.handle === c.lead) || items.slice().sort((a, b) => b.sold - a.sold)[0];
  return {
    ...c,
    count: items.length,
    minPrice: Math.min(...items.map((p) => p.price)),
    minMl: Math.min(...items.map((p) => p.canMl)),
    lead: lead?.handle,
    tint: lead?.tile,
    products: items.map((p) => p.handle),
  };
});
fs.writeFileSync(path.join(dataDir, 'collections.json'), JSON.stringify(collections, null, 1));

// ---------- shapes, badges, logo ----------
const shapesDir = path.join(imgDir, 'shapes');
fs.mkdirSync(shapesDir, { recursive: true });
const write = (name, svg) => fs.writeFileSync(path.join(shapesDir, name), svg);
write('torn-edge.svg', tornEdgeSvg());
write('wave.svg', waveSvg());
write('hills.svg', hillsSvg());
write('hills-light.svg', hillsSvg({ seed: 9 }));
write('badge-ice.svg', badgeSvg());
write('badge-heart.svg', badgeSvg({ text: 'I LOVE • I LOVE • I LOVE • ', centre: 'heart' }));
write('play-badge.svg', playBadgeSvg());
write('logo.svg', logoSvg());
write('logo-lime.svg', logoSvg({ fill: '#DAF45B', bubble: '#E0FA63', stroke: '#DAF45B' }));
write('favicon.svg', faviconSvg());
write('blob.svg', blobSvg());
write('ice.svg', iceCubeSvg());
write('bubble.svg', bubbleSvg());
write('stars-fill.svg', starsSvg('fill'));
write('stars-outline.svg', starsSvg('outline'));
for (const f of ['lime', 'lemon', 'orange', 'cherry', 'grape', 'peach', 'mango', 'berry', 'mojito', 'coconut'])
  write(`fruit-${f}.svg`, fruitSvg(f));

// ---------- art the avatars need ----------
const art = (handle) => {
  const p = products.find((x) => x.handle === handle);
  if (!p) throw new Error('avatar needs product ' + handle);
  return p.art;
};
const S = {
  coke: art('coca-cola-original-250ml-can'),
  sprite: art('sprite-250ml-can'),
  fanta: art('fanta-orange-250ml-can'),
  pepsi: art('pepsi-250ml-can'),
};

// team avatars (About page)
const avDir = path.join(imgDir, 'avatars');
fs.mkdirSync(avDir, { recursive: true });
const AV = [
  {
    n: 'crew-1',
    bg: '#FFD9B3',
    skin: '#C98E67',
    hair: '#241611',
    style: 'hijab',
    shirt: '#11704B',
    cloth: '#E0FA63',
    can: S.sprite,
  },
  {
    n: 'crew-2',
    bg: '#D7ECFF',
    skin: '#D9A07C',
    hair: '#1B1310',
    style: 'short',
    shirt: '#DE114A',
    beard: true,
    can: S.coke,
  },
  { n: 'crew-3', bg: '#F3DAFF', skin: '#E4B494', hair: '#3A241A', style: 'long', shirt: '#F2B90C', can: S.fanta },
  {
    n: 'crew-4',
    bg: '#DDF5C9',
    skin: '#B97E58',
    hair: '#1A120E',
    style: 'curly',
    shirt: '#1456B8',
    glasses: true,
    can: S.pepsi,
  },
];
for (const a of AV) fs.writeFileSync(path.join(avDir, a.n + '.svg'), avatarSvg(a));

// ---------- editorial content ----------
fs.writeFileSync(path.join(dataDir, 'posts.json'), JSON.stringify(POSTS, null, 1));
fs.writeFileSync(path.join(dataDir, 'faq.json'), JSON.stringify(FAQ, null, 1));
fs.writeFileSync(path.join(dataDir, 'pages.json'), JSON.stringify(PAGES, null, 1));

// ---------- sample reviews (only when none exist yet) ----------
const seeded = seedReviews(dataDir, products);

console.log(
  `products: ${products.length}, collections: ${collections.length}, packs: ${PACKS.length}, posts: ${POSTS.length}${seeded ? ', sample reviews seeded' : ''}`,
);
