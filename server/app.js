// Request listener shared by `node server.js` and the Vercel function (api/index.js): sends /api/* to the JSON API
// and everything else to the page and static file server.
import { URL } from 'node:url';
import { handleApi } from './routes.js';
import { handleStatic, notFound } from './static.js';
import { clientIp } from './util.js';

// No page on this site needs a URL anywhere near this long; refusing early keeps junk out of the logs and the router.
const MAX_URL_LENGTH = 4096;

export function handleRequest(req, res) {
  if (!req.url || req.url.length > MAX_URL_LENGTH) {
    res.writeHead(414, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('URI too long');
  }
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }
  // handleApi is async and resolves once the response has been written; it reports its own errors.
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url, clientIp(req));
  try {
    handleStatic(req, res, url);
  } catch (e) {
    console.error('Static error:', e);
    if (!res.headersSent) notFound(req, res);
  }
}
