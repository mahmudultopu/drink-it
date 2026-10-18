// Shared helpers for the vector art generator: font outlines, colour maths, tiny SVG builders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(here, '..', 'fonts');
const fontCache = new Map();

export function font(name) {
  if (!fontCache.has(name)) {
    const buf = fs.readFileSync(path.join(FONT_DIR, name + '.ttf'));
    fontCache.set(name, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  return fontCache.get(name);
}

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Convert text to outlined path data (so SVGs render identically everywhere, even inside <img>).
 * Baseline sits at y = 0 and the text starts at x = 0. Returns { d, width, ascent }.
 */
// Outlines are generated at K× size and rounded to integers (saves bytes), then drawn with scale(1/K).
export const K = 4;
export const KS = 1 / K;

export function textPath(fontName, text, size, { letterSpacing = 0 } = {}) {
  const f = font(fontName);
  const big = size * K;
  const scale = big / f.unitsPerEm;
  if (!letterSpacing) {
    const p = f.getPath(text, 0, 0, big, { kerning: true });
    return {
      d: p.toPathData(0),
      width: f.getAdvanceWidth(text, big, { kerning: true }) / K,
      ascent: (f.ascender * scale) / K,
    };
  }
  let x = 0;
  const glyphs = f.stringToGlyphs(text);
  const parts = [];
  glyphs.forEach((g, i) => {
    parts.push(g.getPath(x, 0, big).toPathData(0));
    x += g.advanceWidth * scale + letterSpacing * K;
    if (i < glyphs.length - 1) x += f.getKerningValue(g, glyphs[i + 1]) * scale;
  });
  return { d: parts.join(' '), width: (x - letterSpacing * K) / K, ascent: (f.ascender * scale) / K };
}

/** Text shrunk (if needed) to fit maxW. Returns { d, width, size }. */
export function fitText(fontName, text, { size = 12, maxW = Infinity, letterSpacing = 0 } = {}) {
  let s = size;
  let t = textPath(fontName, text, s, { letterSpacing });
  if (t.width > maxW) {
    const k = maxW / t.width;
    s = s * k;
    t = textPath(fontName, text, s, { letterSpacing: letterSpacing * k });
  }
  return { ...t, size: s };
}

/** Outlined text, horizontally centred on x=cx with baseline y. Auto-shrinks to fit maxW. */
export function textNode(
  fontName,
  text,
  { cx = 0, y = 0, size = 12, maxW = Infinity, fill = '#000', letterSpacing = 0, opacity = 1, extra = '' } = {},
) {
  const t = fitText(fontName, text, { size, maxW, letterSpacing });
  const x = r1(cx - t.width / 2);
  return `<path d="${t.d}" transform="translate(${x} ${r1(y)}) scale(${KS})" fill="${fill}"${opacity !== 1 ? ` fill-opacity="${opacity}"` : ''} ${extra}/>`;
}

export function textWidth(fontName, text, size, letterSpacing = 0) {
  return textPath(fontName, text, size, { letterSpacing }).width;
}

// ---------- colour helpers ----------
export function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgb2hex([r, g, b]) {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
export function mix(a, b, t) {
  const A = hex2rgb(a),
    B = hex2rgb(b);
  return rgb2hex(A.map((v, i) => v + (B[i] - v) * t));
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);

/** Pastel tile colour used behind a can (matches the soft cream-tinted tiles of the reference theme). */
export function tileColor(body) {
  return mix(mix(body, '#ffffff', 0.9), '#FFF8E8', 0.3);
}

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const num = r1;

// deterministic PRNG (mulberry32) so generated art is stable between runs
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function svgDoc(viewBox, inner, { width, height, title, par } = {}) {
  const [x, y, w, h] = viewBox;
  // always give the file an intrinsic size so <img> sizing (height:100%, width:auto) behaves predictably
  width = width ?? Math.round(w);
  height = height ?? Math.round(h);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${x} ${y} ${w} ${h}"${par ? ` preserveAspectRatio="${par}"` : ''}${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''}${title ? ` role="img" aria-label="${esc(title)}"` : ''}>${inner}</svg>`;
}
