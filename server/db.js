// Tiny JSON-file database. Catalogue files are reloaded when edited on disk; mutable collections
// (orders, users, reviews, ...) live in memory and are written back atomically on every change.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// DRINKIT_DATA_DIR moves the data folder elsewhere (the Vercel entry points it at the writable /tmp).
export const DATA_DIR = process.env.DRINKIT_DATA_DIR ? path.resolve(process.env.DRINKIT_DATA_DIR) : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function readFileJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`Could not read ${file}: ${e.message}`);
  }
}

export function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

/** File whose contents are re-read whenever the file changes on disk (catalogue / config). */
class WatchedJson {
  constructor(name, fallback) {
    this.file = path.join(DATA_DIR, name);
    this.fallback = fallback;
    this.mtime = 0;
    this.value = fallback;
  }
  get() {
    let m = 0;
    try { m = fs.statSync(this.file).mtimeMs; } catch { /* missing */ }
    if (m !== this.mtime) {
      this.value = readFileJson(this.file, this.fallback);
      this.mtime = m;
    }
    return this.value;
  }
  save(value) {
    this.value = value;
    writeJsonAtomic(this.file, value);
    try { this.mtime = fs.statSync(this.file).mtimeMs; } catch { /* ignore */ }
  }
}

/** In-memory collection persisted on change. */
class Table {
  constructor(name, fallback = []) {
    this.file = path.join(DATA_DIR, name);
    this.rows = readFileJson(this.file, fallback);
    if (!fs.existsSync(this.file)) writeJsonAtomic(this.file, this.rows);
  }
  all() { return this.rows; }
  save() { writeJsonAtomic(this.file, this.rows); }
  add(row) { this.rows.push(row); this.save(); return row; }
  find(fn) { return this.rows.find(fn); }
  filter(fn) { return this.rows.filter(fn); }
  remove(fn) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !fn(r));
    if (this.rows.length !== before) this.save();
  }
}

export const site = new WatchedJson('site.json', {});
export const products = new WatchedJson('products.json', []);
export const collections = new WatchedJson('collections.json', []);
export const posts = new WatchedJson('posts.json', []);
export const faq = new WatchedJson('faq.json', []);
export const pages = new WatchedJson('pages.json', {});
export const coupons = new WatchedJson('coupons.json', []);

export const orders = new Table('orders.json');
export const users = new Table('users.json');
export const reviews = new Table('reviews.json');
export const subscribers = new Table('subscribers.json');
export const messages = new Table('messages.json');

export const adminFile = path.join(DATA_DIR, 'admin.json');
export const secretFile = path.join(DATA_DIR, 'secret.key');
