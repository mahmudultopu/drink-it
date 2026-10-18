// Vercel entry point. vercel.json sends every request that is not a static file in public/ to this function,
// which runs the same page + API handlers as `node server.js`.
import '../server/vercel-env.js'; // keep first: sets the environment and data folder before the server modules load
import { handleRequest } from '../server/app.js';

export default function handler(req, res) {
  return handleRequest(req, res);
}
