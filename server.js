// Drink it — zero-dependency Node server: storefront pages, JSON API and admin dashboard.
// Start:  npm start   (or double-click start.bat)      Open: http://localhost:3000
import http from 'node:http';
import { handleRequest } from './server/app.js';
import { ensureAdmin } from './server/auth.js';
import './server/db.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

if (process.argv.includes('--reset-admin')) {
  const pw = ensureAdmin({ reset: true });
  console.log(`\n  New admin password: ${pw}\n`);
  process.exit(0);
}

const server = http.createServer(handleRequest);

server.on('clientError', (err, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));

server.listen(PORT, HOST, () => {
  const created = ensureAdmin();
  console.log('\n  Drink it is running\n');
  console.log(`  Store:  http://localhost:${PORT}`);
  console.log(`  Admin:  http://localhost:${PORT}/admin`);
  if (created) {
    console.log('\n  ----------------------------------------------------------');
    console.log('  FIRST RUN - your admin password (shown only once):');
    console.log(`      ${created}`);
    console.log('  Forgot it later?  node server.js --reset-admin');
    console.log('  ----------------------------------------------------------\n');
  } else if (process.env.DRINKIT_ADMIN_PASSWORD) {
    console.log('  Admin password: taken from DRINKIT_ADMIN_PASSWORD');
  } else {
    console.log('  Admin password: set on first run (forgot it? node server.js --reset-admin)');
  }
  console.log('');
});
