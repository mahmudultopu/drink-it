// Drink it - zero-dependency Node server: storefront pages, JSON API and admin dashboard.
//
//   npm start               (or double-click start.bat)      ->  http://localhost:3000
//   node server.js --reset-admin                              ->  issue a new admin password
//
// Configuration is read from environment variables; see README.md ("Configuration").
import http from 'node:http';
import { handleRequest } from './server/app.js';
import { checkConfig, ensureAdmin } from './server/auth.js';
import './server/db.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

/** Print a boxed notice so one-time secrets are hard to miss in the log. */
function banner(lines) {
  console.log('\n  ----------------------------------------------------------');
  for (const line of lines) console.log(`  ${line}`);
  console.log('  ----------------------------------------------------------\n');
}

async function main() {
  // Fail fast on unusable settings (for example a too-short DRINKIT_SECRET) and flag weak ones.
  for (const warning of checkConfig()) console.warn(`  [config] ${warning}`);

  if (process.argv.includes('--reset-admin')) {
    const password = await ensureAdmin({ reset: true });
    if (password) banner(['New admin password (shown only once):', `    ${password}`]);
    else console.log('\n  DRINKIT_ADMIN_PASSWORD is set, so no stored password was changed.\n');
    return;
  }

  const created = await ensureAdmin();

  const server = http.createServer({ maxHeaderSize: 16 * 1024 }, handleRequest);

  // Slow-client protection (Slowloris and friends): bound how long a client may take to send its request.
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 10_000;

  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });

  console.log('\n  Drink it is running\n');
  console.log(`  Store:  http://localhost:${PORT}`);
  console.log(`  Admin:  http://localhost:${PORT}/admin`);
  if (created) {
    banner([
      'FIRST RUN - your admin password (shown only once):',
      `    ${created}`,
      'Forgot it later?  node server.js --reset-admin',
    ]);
  } else if (process.env.DRINKIT_ADMIN_PASSWORD) {
    console.log('  Admin password: taken from DRINKIT_ADMIN_PASSWORD\n');
  } else {
    console.log('  Admin password: set on first run (forgot it? node server.js --reset-admin)\n');
  }

  // Finish in-flight requests before exiting so a deploy or Ctrl+C never cuts a customer off mid-order.
  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n  ${signal} received, shutting down...`);
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// A rejected promise nobody handled is a bug, not a reason to keep running in an unknown state.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

main().catch((err) => {
  console.error(`\n  Could not start: ${err.message}\n`);
  process.exit(1);
});
