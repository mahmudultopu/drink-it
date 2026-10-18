// A tiny JSON-file database.
//
//  - Catalogue files (site, products, collections, ...) are re-read whenever they change on disk, so edits show
//    up without restarting the server.
//  - Mutable collections (orders, users, reviews, ...) live in memory and are written back atomically on every
//    change.
//
// It is deliberately simple: one process, one writer. For several server instances or heavy traffic, replace this
// module with a real database - the rest of the code only uses the small API exported here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// DRINKIT_DATA_DIR moves the data folder elsewhere (the Vercel entry points it at the writable /tmp).
export const DATA_DIR = process.env.DRINKIT_DATA_DIR
  ? path.resolve(process.env.DRINKIT_DATA_DIR)
  : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function readFileJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    // refuse to start on a corrupt file rather than silently overwriting customer data with an empty list
    throw new Error(`Could not read ${file}: ${e.message}`, { cause: e });
  }
}

/**
 * Write JSON so that a crash or power cut can never leave a half-written file: write to a temporary file in the
 * same folder, flush it to disk, then rename it over the original (rename is atomic). Files are only readable by
 * the server's user because they hold customer details and password hashes.
 */
export function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 1));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

/** A file whose contents are re-read whenever its modification time changes (catalogue and configuration). */
class WatchedJson {
  constructor(name, fallback) {
    this.file = path.join(DATA_DIR, name);
    this.fallback = fallback;
    this.mtime = 0;
    this.value = fallback;
  }
  get() {
    let m = 0;
    try {
      m = fs.statSync(this.file).mtimeMs;
    } catch {
      /* missing: use the fallback */
    }
    if (m !== this.mtime) {
      this.value = readFileJson(this.file, this.fallback);
      this.mtime = m;
    }
    return this.value;
  }
  save(value) {
    this.value = value;
    writeJsonAtomic(this.file, value);
    try {
      this.mtime = fs.statSync(this.file).mtimeMs;
    } catch {
      /* ignore */
    }
  }
}

/** An in-memory list of records that is persisted after every change. */
class Table {
  constructor(name, fallback = []) {
    this.file = path.join(DATA_DIR, name);
    this.rows = readFileJson(this.file, fallback);
    if (!fs.existsSync(this.file)) writeJsonAtomic(this.file, this.rows);
  }
  all() {
    return this.rows;
  }
  /** Persist the current rows; call after mutating a record in place. */
  save() {
    writeJsonAtomic(this.file, this.rows);
  }
  add(row) {
    this.rows.push(row);
    this.save();
    return row;
  }
  find(fn) {
    return this.rows.find(fn);
  }
  filter(fn) {
    return this.rows.filter(fn);
  }
  some(fn) {
    return this.rows.some(fn);
  }
  /** Delete every row `fn` matches. */
  remove(fn) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !fn(r));
    if (this.rows.length !== before) this.save();
  }
}

// catalogue and configuration (edit the files, or use the admin dashboard)
export const site = new WatchedJson('site.json', {});
export const products = new WatchedJson('products.json', []);
export const collections = new WatchedJson('collections.json', []);
export const posts = new WatchedJson('posts.json', []);
export const faq = new WatchedJson('faq.json', []);
export const pages = new WatchedJson('pages.json', {});
export const coupons = new WatchedJson('coupons.json', []);

// records written by the store itself
export const orders = new Table('orders.json');
export const users = new Table('users.json');
export const reviews = new Table('reviews.json');
export const subscribers = new Table('subscribers.json');
export const messages = new Table('messages.json');

// credentials, generated on first run (see auth.js)
export const adminFile = path.join(DATA_DIR, 'admin.json');
export const secretFile = path.join(DATA_DIR, 'secret.key');
