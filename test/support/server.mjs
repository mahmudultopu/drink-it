// Test helpers: start the real server against a throw-away copy of the catalogue, and a small HTTP client that
// keeps cookies between requests (like a browser tab would).
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ADMIN_PASSWORD = 'test-admin-passphrase-2026';

// Files the server writes while running; a fresh test server starts without them.
const RUNTIME_FILES = ['orders.json', 'users.json', 'subscribers.json', 'messages.json', 'admin.json', 'secret.key'];

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

/**
 * Start `node server.js` on a free port with its own copy of data/.
 * @param {Record<string, string>} [env] extra environment variables for the server process
 * @returns {Promise<{ base: string, port: number, dataDir: string, stop: () => Promise<void> }>}
 */
export async function startServer(env = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'drinkit-test-'));
  await cp(path.join(ROOT, 'data'), dataDir, { recursive: true });
  for (const file of RUNTIME_FILES) await rm(path.join(dataDir, file), { force: true });

  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DRINKIT_DATA_DIR: dataDir,
      DRINKIT_SECRET: 'test-secret-'.padEnd(48, 'x'),
      DRINKIT_TRUST_PROXY: '1', // the tests act as a proxy: each Client below reports its own visitor address
      DRINKIT_ADMIN_PASSWORD: ADMIN_PASSWORD,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start in time:\n${output}`)), 15_000);
    child.once('exit', (code) => reject(new Error(`server exited early (code ${code}):\n${output}`)));
    const poll = setInterval(() => {
      if (output.includes('Drink it is running')) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve();
      }
    }, 25);
  });

  return {
    base: `http://127.0.0.1:${port}`,
    port,
    dataDir,
    async stop() {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

let nextVisitor = 1;

/**
 * A cookie-keeping JSON client. Every request goes to `base`; responses are `{ status, headers, body }`.
 * Each client is a separate "visitor" with its own address, so rate limits apply to it alone.
 */
export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.ip = `203.0.113.${nextVisitor++ % 250}`;
  }

  /** Cookie header value that will be sent with the next request. */
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(method, url, { json, headers = {}, body, cookies = true } = {}) {
    const h = { 'x-forwarded-for': this.ip, ...headers };
    if (json !== undefined) {
      h['content-type'] ??= 'application/json';
      body = JSON.stringify(json);
    }
    if (cookies && this.cookies.size) h.cookie ??= this.cookieHeader();
    const res = await fetch(this.base + url, { method, headers: h, body, redirect: 'manual' });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      if (/max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, decodeURIComponent(pair.slice(eq + 1)));
    }
    const text = await res.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not JSON (HTML, CSV, plain text) */
    }
    return { status: res.status, headers: res.headers, body: parsed };
  }

  get(url, opts) {
    return this.request('GET', url, opts);
  }
  post(url, json, opts = {}) {
    return this.request('POST', url, { ...opts, json });
  }
  patch(url, json, opts = {}) {
    return this.request('PATCH', url, { ...opts, json });
  }
}

/**
 * Send a request with the path exactly as given. fetch() normalises "/../" and "%2e%2e" away before sending, so
 * path traversal probes have to bypass it.
 */
export function rawRequest(base, rawPath, { method = 'GET' } = {}) {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: rawPath, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}
