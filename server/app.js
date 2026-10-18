// Request listener shared by `node server.js` and the Vercel function (api/index.js).
import { URL } from 'node:url';
import { handleApi } from './routes.js';
import { handleStatic, notFound } from './static.js';
import { clientIp } from './util.js';

export function handleRequest(req, res) {
  const ip = clientIp(req);
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url, ip); // async; resolves once the response is written
  try {
    handleStatic(req, res, url);
  } catch (e) {
    console.error('Static error:', e);
    if (!res.headersSent) notFound(req, res);
  }
}
