// Build step: generates data/products.json, data/collections.json and all vector art under public/assets/img.
// Run with:  npm run build:catalog
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProducts, COLLECTIONS, PACKS } from './catalog.mjs';
import { canSvg, canAngleSvg, pack6Svg, pack12Svg, pack24Svg } from './art/can.mjs';
import { tileColor, mix, hex2rgb } from './art/lib.mjs';
import { tornEdgeSvg, waveSvg, hillsSvg, badgeSvg, playBadgeSvg, logoSvg, faviconSvg, fruitSvg, starsSvg, blobSvg, iceCubeSvg, bubbleSvg } from './art/shapes.mjs';
import { heroScene, rowScene, stripsScene } from './art/scenes.mjs';
import { avatarSvg } from './art/avatars.mjs';
import { POSTS, FAQ, PAGES } from './content.mjs';
import { seedReviews } from './seed.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const imgDir = path.join(root, 'public', 'assets', 'img');
const cansDir = path.join(imgDir, 'cans');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(cansDir, { recursive: true });

const luminance = (hex) => {
  const [r, g, b] = hex2rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// ---------- products + can art ----------
const products = buildProducts();
for (const p of products) {
  const a = p.art;
  p.tile = tileColor(luminance(a.body) > 215 ? a.accent : luminance(a.body) < 40 ? mix(a.accent, '#888888', 0.4) : a.body);
  const base = `/assets/img/cans/${p.handle}`;
  fs.writeFileSync(path.join(cansDir, `${p.handle}.svg`), canSvg(a, { title: p.title }));
  fs.writeFileSync(path.join(cansDir, `${p.handle}-angle.svg`), canAngleSvg(a, { title: p.title }));
  fs.writeFileSync(path.join(cansDir, `${p.handle}-pack6.svg`), pack6Svg(a));
  fs.writeFileSync(path.join(cansDir, `${p.handle}-pack12.svg`), pack12Svg(a));
  fs.writeFileSync(path.join(cansDir, `${p.handle}-pack24.svg`), pack24Svg(a));
  p.images = {
    single: `${base}.svg`,
    angle: `${base}-angle.svg`,
    pack6: `${base}-pack6.svg`,
    pack12: `${base}-pack12.svg`,
    pack24: `${base}-pack24.svg`,
  };
}
fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify(products, null, 1));

// ---------- collections (with a representative can for each) ----------
const collections = COLLECTIONS.map((c) => {
  const items = products.filter((p) => p.collections.includes(c.handle));
  const lead = items.slice().sort((a, b) => b.sold - a.sold)[0];
  return { ...c, count: items.length, minPrice: Math.min(...items.map((p) => p.price)), minMl: Math.min(...items.map((p) => p.canMl)), lead: lead?.handle, tint: lead?.tile, products: items.map((p) => p.handle) };
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
for (const f of ['lime', 'lemon', 'orange', 'cherry', 'grape', 'peach', 'mango', 'berry', 'mojito', 'coconut']) write(`fruit-${f}.svg`, fruitSvg(f));

// ---------- scenes ----------
const scenesDir = path.join(imgDir, 'scenes');
fs.mkdirSync(scenesDir, { recursive: true });
const art = (handle) => {
  const p = products.find((x) => x.handle === handle);
  if (!p) throw new Error('scene needs product ' + handle);
  return p.art;
};
const S = {
  coke: art('coca-cola-original-250ml-can'), sprite: art('sprite-250ml-can'), fanta: art('fanta-orange-250ml-can'),
  pepsi: art('pepsi-250ml-can'), dew: art('mountain-dew-250ml-can'), mirinda: art('mirinda-orange-250ml-can'),
  clemon: art('clemon-lemon-soda-250ml-can'), mojito: art('clemon-mojito-250ml-can'), mojo: art('mojo-cola-250ml-can'),
  speed: art('speed-energy-drink-250ml-can'), sevenup: art('7up-250ml-can'), redbull: art('red-bull-energy-drink-250ml-can'),
  rani: art('rani-float-grape-240ml-can'), zero: art('coke-zero-sugar-250ml-can'),
};
const sw = (name, svg) => fs.writeFileSync(path.join(scenesDir, name), svg);
sw('hero-1.svg', heroScene([S.coke, S.sprite, S.fanta, S.dew, S.pepsi]));
sw('hero-2.svg', heroScene([S.dew, S.fanta, S.mojito, S.mirinda, S.sevenup], { bg1: '#FFF0DC', bg2: '#FFD3A5', sun: '#FFF9EE', floor: '#FFB66B', slices: ['orange', 'lemon', 'lime'], seed: 8 }));
sw('banner-cans.svg', rowScene([S.fanta, S.sprite, S.coke, S.pepsi, S.mirinda], { bg: '#F5C531', stripe: '#FFE27A', w: 1424, h: 852, fill: 0.84, overlap: 0.92 }));
sw('blog-1.svg', rowScene([S.fanta, S.mirinda, S.clemon, S.mojo], { bg: '#FFA977', stripe: '#FFC9A8', seed: 2 }));
sw('blog-2.svg', rowScene([S.pepsi, S.sprite, S.dew, S.sevenup], { bg: '#F5C531', stripe: '#FFE27A', seed: 3 }));
sw('blog-3.svg', rowScene([S.coke, S.rani, S.zero, S.redbull], { bg: '#F26FA3', stripe: '#FF9CC2', seed: 4 }));
sw('blog-4.svg', rowScene([S.speed, S.redbull, S.dew], { bg: '#4DB6E8', stripe: '#8ED2F2', seed: 6, fill: 0.8 }));
sw('blog-5.svg', rowScene([S.mojito, S.clemon, S.sprite], { bg: '#7FD08C', stripe: '#B3E6BA', seed: 7, fill: 0.8 }));
sw('blog-6.svg', rowScene([S.coke, S.fanta, S.sprite, S.pepsi, S.mojo], { bg: '#B57BE0', stripe: '#D2A9F0', seed: 9 }));
sw('about-scene.svg', rowScene([S.mirinda, S.coke, S.sprite], { bg: '#F2B90C', stripe: '#FFD84D', w: 1140, h: 960, seed: 5, fill: 0.8, overlap: 0.9, crop: 0.04 }));
sw('strips.svg', stripsScene([S.coke, S.fanta, S.sprite, S.pepsi, S.speed]));

// team avatars (About page)
const avDir = path.join(imgDir, 'avatars');
fs.mkdirSync(avDir, { recursive: true });
const AV = [
  { n: 'crew-1', bg: '#FFD9B3', skin: '#C98E67', hair: '#241611', style: 'hijab', shirt: '#11704B', cloth: '#E0FA63', can: S.sprite },
  { n: 'crew-2', bg: '#D7ECFF', skin: '#D9A07C', hair: '#1B1310', style: 'short', shirt: '#DE114A', beard: true, can: S.coke },
  { n: 'crew-3', bg: '#F3DAFF', skin: '#E4B494', hair: '#3A241A', style: 'long', shirt: '#F2B90C', can: S.fanta },
  { n: 'crew-4', bg: '#DDF5C9', skin: '#B97E58', hair: '#1A120E', style: 'curly', shirt: '#1456B8', glasses: true, can: S.pepsi },
];
for (const a of AV) fs.writeFileSync(path.join(avDir, a.n + '.svg'), avatarSvg(a));

// ---------- editorial content ----------
fs.writeFileSync(path.join(dataDir, 'posts.json'), JSON.stringify(POSTS, null, 1));
fs.writeFileSync(path.join(dataDir, 'faq.json'), JSON.stringify(FAQ, null, 1));
fs.writeFileSync(path.join(dataDir, 'pages.json'), JSON.stringify(PAGES, null, 1));

// ---------- sample reviews (only when none exist yet) ----------
const seeded = seedReviews(dataDir, products);

console.log(`products: ${products.length}, collections: ${collections.length}, packs: ${PACKS.length}, posts: ${POSTS.length}${seeded ? ', sample reviews seeded' : ''}`);


