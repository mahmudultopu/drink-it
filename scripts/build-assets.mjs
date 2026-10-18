// Production build of the front end:  npm run build
//
//   public/assets/js/*.js      ->  public/assets/dist/js/    bundled, minified, split per page, fingerprinted
//   public/assets/css/parts/   ->  public/assets/dist/css/   one minified, fingerprinted stylesheet per audience
//   public/assets/img, fonts   ->  content hashes, so the server can add ?v=<hash> and cache them for a year
//   public/assets/dist/manifest.json tells the server (server/assets.js) what to point pages at.
//
// The server also runs without this step, straight from the readable sources, which is convenient while developing.
import { build, transform } from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { versionUrls } from '../server/assets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const ASSETS = path.join(PUBLIC, 'assets');
const DIST = path.join(ASSETS, 'dist');
const DIST_URL = '/assets/dist';

// ES2020 covers every browser that supports ES modules with dynamic import() and optional chaining; anything newer
// the sources use (such as ||=) is rewritten by esbuild.
const TARGET = 'es2020';

/** URL path ('/assets/img/x.webp') of a file inside public/. */
const urlOf = (file) => '/' + path.relative(PUBLIC, file).split(path.sep).join('/');

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Short content hash of a file; changes exactly when the file does. */
async function fileHash(file) {
  return crypto
    .createHash('sha1')
    .update(await fs.readFile(file))
    .digest('hex')
    .slice(0, 10);
}

/** Hash every image and font so references to them can carry ?v=<hash>. */
async function hashAssets() {
  const table = new Map();
  for (const dir of ['img', 'fonts']) {
    for (const file of await walk(path.join(ASSETS, dir))) table.set(urlOf(file), await fileHash(file));
  }
  return table;
}

/** esbuild plugin: add ?v=<hash> to image and font URLs inside the sources before they are bundled and hashed. */
const versionPlugin = (table) => ({
  name: 'version-assets',
  setup(b) {
    b.onLoad({ filter: /\.(js|css)$/ }, async ({ path: file }) => ({
      contents: versionUrls(await fs.readFile(file, 'utf8'), table),
      loader: file.endsWith('.css') ? 'css' : 'js',
    }));
  },
});

/** Output files an entry loads immediately (its static imports, followed transitively), for <link rel=modulepreload>. */
function staticImports(metafile, entryOutput) {
  const seen = new Set();
  const visit = (out) => {
    for (const imp of metafile.outputs[out]?.imports ?? []) {
      if (imp.kind !== 'import-statement' || seen.has(imp.path)) continue;
      seen.add(imp.path);
      visit(imp.path);
    }
  };
  visit(entryOutput);
  return [...seen].map((p) => urlOf(path.resolve(ROOT, p)));
}

async function buildScripts(table) {
  const result = await build({
    entryPoints: { app: path.join(ASSETS, 'js/app.js'), admin: path.join(ASSETS, 'js/admin.js') },
    absWorkingDir: ROOT,
    outdir: path.join(DIST, 'js'),
    entryNames: '[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    bundle: true,
    splitting: true,
    format: 'esm',
    target: TARGET,
    minify: true,
    legalComments: 'none',
    metafile: true,
    plugins: [versionPlugin(table)],
    logLevel: 'warning',
  });
  const entries = {};
  const pages = {};
  for (const [output, meta] of Object.entries(result.metafile.outputs)) {
    if (!meta.entryPoint) continue;
    const name = path.basename(meta.entryPoint); // app.js | admin.js
    if (name !== 'app.js' && name !== 'admin.js') continue;
    entries[`/assets/js/${name}`] = {
      file: urlOf(path.resolve(ROOT, output)),
      preload: staticImports(result.metafile, output),
    };
    // Each page module is a dynamically imported chunk named after its source file (home-HASH.js). Record the chunk
    // together with what it imports, so the server can preload all of it while the page is still being parsed.
    for (const imp of meta.imports.filter((i) => i.kind === 'dynamic-import')) {
      const page = path.basename(imp.path).replace(/-[A-Z0-9]+\.js$/, '');
      pages[page] = [urlOf(path.resolve(ROOT, imp.path)), ...staticImports(result.metafile, imp.path)];
    }
  }
  return { entries, pages };
}

async function buildStyles(table) {
  const parts = (await fs.readdir(path.join(ASSETS, 'css/parts'))).filter((f) => f.endsWith('.css')).sort();
  const entries = {};
  // The admin dashboard has its own sheet, so storefront visitors never download it.
  const groups = {
    theme: parts.filter((f) => !f.includes('admin')),
    admin: parts.filter((f) => f.includes('admin')),
  };
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'drinkit-css-'));
  try {
    const entryPoints = {};
    for (const [name, files] of Object.entries(groups)) {
      const text = (await Promise.all(files.map((f) => fs.readFile(path.join(ASSETS, 'css/parts', f), 'utf8')))).join(
        '\n',
      );
      const file = path.join(scratch, `${name}.css`);
      await fs.writeFile(file, versionUrls(text, table));
      entryPoints[name] = file;
    }
    const result = await build({
      entryPoints,
      absWorkingDir: ROOT,
      outdir: path.join(DIST, 'css'),
      entryNames: '[name]-[hash]',
      bundle: true,
      external: ['/assets/*'], // fonts and images are referenced by URL, not bundled
      target: TARGET,
      minify: true,
      legalComments: 'none',
      metafile: true,
      logLevel: 'warning',
    });
    for (const [output, meta] of Object.entries(result.metafile.outputs)) {
      if (!meta.entryPoint) continue;
      entries[`/assets/css/${path.basename(meta.entryPoint)}`] = { file: urlOf(path.resolve(ROOT, output)) };
    }
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
  return entries;
}

/** The pre-paint script is inlined into every page (the server allows it in the CSP by hash). */
async function minifyBootScript() {
  const source = await fs.readFile(path.join(ASSETS, 'js/boot.js'), 'utf8');
  return (await transform(source, { minify: true, target: TARGET, legalComments: 'none' })).code.trim();
}

async function report(entries) {
  const rows = [];
  for (const file of await walk(DIST)) {
    if (file.endsWith('manifest.json')) continue;
    const bytes = await fs.readFile(file);
    rows.push({
      file: urlOf(file).replace(`${DIST_URL}/`, ''),
      raw: bytes.length,
      gzip: zlib.gzipSync(bytes, { level: 9 }).length,
      brotli: zlib.brotliCompressSync(bytes).length,
    });
  }
  const fmt = (n) => `${(n / 1024).toFixed(1)} KB`.padStart(10);
  const width = Math.max(...rows.map((r) => r.file.length));
  console.log(`\n  ${'file'.padEnd(width)}${'raw'.padStart(10)}${'gzip'.padStart(10)}${'brotli'.padStart(10)}`);
  for (const r of rows.sort((a, b) => b.raw - a.raw)) {
    console.log(`  ${r.file.padEnd(width)}${fmt(r.raw)}${fmt(r.gzip)}${fmt(r.brotli)}`);
  }
  const total = rows.reduce((t, r) => ({ raw: t.raw + r.raw, gzip: t.gzip + r.gzip, brotli: t.brotli + r.brotli }), {
    raw: 0,
    gzip: 0,
    brotli: 0,
  });
  console.log(`  ${'total'.padEnd(width)}${fmt(total.raw)}${fmt(total.gzip)}${fmt(total.brotli)}\n`);
  return entries;
}

async function main() {
  const started = Date.now();
  await fs.rm(DIST, { recursive: true, force: true });
  const table = await hashAssets();
  const [scripts, styles, boot] = await Promise.all([buildScripts(table), buildStyles(table), minifyBootScript()]);
  const manifest = {
    entries: { ...scripts.entries, ...styles },
    pages: scripts.pages,
    inline: { boot },
    assets: Object.fromEntries([...table].sort(([a], [b]) => a.localeCompare(b))),
  };
  await fs.writeFile(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 1));
  await report(manifest.entries);
  console.log(
    `  built ${table.size} fingerprinted assets and ${Object.keys(manifest.entries).length} bundles in ${Date.now() - started} ms`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
