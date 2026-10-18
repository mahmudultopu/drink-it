// Vercel runs the store as a read-only serverless function, so the JSON "database" cannot live next to the code.
// api/index.js imports this module first: it turns on the HTTPS / proxy settings and points the data folder at
// the writable /tmp, seeded from the committed catalogue in data/.
//
// Anything written there (orders, accounts, reviews, stock changes) is NOT durable: it disappears on a cold
// start and is not shared between instances. That is fine for a preview; for a shop taking real orders use a
// host with a persistent disk (see README) or move the storage in server/db.js to a real database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DRINKIT_SECURE_COOKIES ??= '1';
process.env.DRINKIT_TRUST_PROXY ??= '1';

if (!process.env.DRINKIT_DATA_DIR) {
  const seed = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const dir = path.join(os.tmpdir(), 'drink-it-data');
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(seed, dir, { recursive: true, force: false });
  process.env.DRINKIT_DATA_DIR = dir;
  process.env.DRINKIT_EPHEMERAL = '1';
}
