// Responsive copies of the rendered images, so small screens and small slots do not download the full-size files.
//
//   node scripts/render/derive.mjs        (also run at the end of `npm run render`)
//
//   products/<handle>-pack6|pack12|pack24-sm.webp    192 px wide - pack swatches, cart lines and option pickers
//   scenes/<name>-<width>.webp                       narrower copies for srcset (see SCENES below)
//
// Files that are already newer than their source are left alone, so re-running is cheap.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMG = path.join(ROOT, 'public', 'assets', 'img');

export const PACK_THUMB_WIDTH = 192;

// scene (without extension) -> widths of the extra copies. The original file is the largest size in each srcset.
const SCENES = {
  'hero-1': [564, 846],
  'hero-2': [564, 846],
  'banner-cans': [712, 1068],
  'about-scene': [570],
  strips: [1400], // the CSS uses it at 1x and the original at 2x
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`blog-${n}`, [480]])),
};

const upToDate = (source, target) =>
  fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(source).mtimeMs;

async function resize(source, target, width, quality = 80) {
  if (upToDate(source, target)) return false;
  await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 5 }).toFile(target);
  return true;
}

/** Small pack photos for every product that has them. Returns the number of files written. */
export async function derivePackThumbs() {
  const dir = path.join(IMG, 'products');
  let written = 0;
  for (const file of fs.readdirSync(dir).filter((f) => /-pack(6|12|24)\.webp$/.test(f))) {
    const target = path.join(dir, file.replace(/\.webp$/, '-sm.webp'));
    if (await resize(path.join(dir, file), target, PACK_THUMB_WIDTH, 72)) written++;
  }
  return written;
}

/** Narrower copies of the hero, banner and blog scenes. Returns the number of files written. */
export async function deriveScenes() {
  const dir = path.join(IMG, 'scenes');
  let written = 0;
  for (const [name, widths] of Object.entries(SCENES)) {
    const source = path.join(dir, `${name}.webp`);
    if (!fs.existsSync(source)) continue;
    for (const width of widths) {
      if (await resize(source, path.join(dir, `${name}-${width}.webp`), width)) written++;
    }
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packs = await derivePackThumbs();
  const scenes = await deriveScenes();
  console.log(`derived ${packs} pack thumbnails and ${scenes} scene sizes`);
}
