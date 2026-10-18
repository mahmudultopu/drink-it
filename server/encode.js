// Cacheable response bodies with on-demand compression.
//
// A Payload holds the bytes of a response together with its content type and validator. Brotli and gzip variants are
// produced the first time a client asks for them and then kept, so every file or page is compressed once rather than
// on every request.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// Below this size the headers cost more than compression saves.
const MIN_COMPRESS_BYTES = 800;

/**
 * Pick the best content coding the client accepts.
 * @param {string | undefined} header the Accept-Encoding request header
 * @returns {'br' | 'gzip' | null}
 */
export function negotiate(header = '') {
  const q = {};
  for (const part of String(header).split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const weight = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    q[name] = weight ? Number(weight.slice(2)) : 1;
  }
  if (q.br > 0) return 'br';
  if (q.gzip > 0 || q['x-gzip'] > 0) return 'gzip';
  return null;
}

export class Payload {
  /**
   * @param {Buffer | string} body response bytes
   * @param {string} type Content-Type header value
   * @param {{ compress?: boolean, quality?: number }} [options] `quality` is the Brotli quality (0-11): high for files
   *   compressed once and served many times, lower for pages that are regenerated
   */
  constructor(body, type, { compress = true, quality = 9 } = {}) {
    this.body = Buffer.isBuffer(body) ? body : Buffer.from(body);
    this.type = type;
    this.compress = compress && this.body.length >= MIN_COMPRESS_BYTES;
    this.quality = quality;
    // Weak validator: the same entity can be delivered in several encodings.
    this.etag = `W/"${crypto.createHash('sha1').update(this.body).digest('base64url').slice(0, 22)}"`;
    this.variants = new Map();
  }

  /** The bytes to send for a client's Accept-Encoding header, and the matching Content-Encoding (if any). */
  select(acceptEncoding) {
    const coding = this.compress ? negotiate(acceptEncoding) : null;
    if (!coding) return { body: this.body, coding: null };
    if (!this.variants.has(coding)) {
      this.variants.set(
        coding,
        coding === 'br'
          ? zlib.brotliCompressSync(this.body, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: this.quality,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: this.body.length,
              },
            })
          : zlib.gzipSync(this.body, { level: 9 }),
      );
    }
    return { body: this.variants.get(coding), coding };
  }
}

/**
 * Send a Payload, answering conditional requests with 304 and HEAD requests without a body.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {Payload} payload
 * @param {Record<string, string | number>} [headers] extra response headers (Cache-Control, security headers...)
 * @param {number} [status]
 */
export function sendPayload(req, res, payload, headers = {}, status = 200) {
  const base = { ETag: payload.etag, Vary: 'Accept-Encoding', ...headers };
  if (status === 200 && matchesEtag(req.headers['if-none-match'], payload.etag)) {
    res.writeHead(304, base);
    return res.end();
  }
  const { body, coding } = payload.select(req.headers['accept-encoding']);
  res.writeHead(status, {
    ...base,
    'Content-Type': payload.type,
    'Content-Length': body.length,
    ...(coding ? { 'Content-Encoding': coding } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/** If-None-Match may list several validators (or `*`); weak comparison is what the spec asks for here. */
function matchesEtag(header, etag) {
  if (!header) return false;
  if (header.trim() === '*') return true;
  const strip = (v) => v.trim().replace(/^W\//, '');
  return header.split(',').some((candidate) => strip(candidate) === strip(etag));
}
