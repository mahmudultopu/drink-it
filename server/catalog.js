// What the storefront is told about products: the compact "card" shape used by listings, the fuller "detail" shape for
// a product page, collection summaries, and review statistics. Stored products carry extra fields (art settings,
// internal ids) that never leave the server.
import { products, reviews, collections } from './db.js';

// Review statistics per product, rebuilt whenever the reviews table is saved.
let statsCache = null;
let statsStamp = '';

function stats() {
  if (!statsCache || statsStamp !== reviews.stamp()) {
    statsStamp = reviews.stamp();
    statsCache = new Map();
    for (const r of reviews.all()) {
      if (!r.approved) continue;
      const s = statsCache.get(r.product) || { sum: 0, count: 0, dist: [0, 0, 0, 0, 0] };
      s.sum += r.rating;
      s.count += 1;
      s.dist[r.rating - 1] += 1;
      statsCache.set(r.product, s);
    }
  }
  return statsCache;
}

/** Average rating (to one decimal), review count and 1-5 star distribution of the approved reviews of a product. */
export function ratingFor(handle) {
  const s = stats().get(handle);
  if (!s) return { rating: 0, reviewCount: 0, dist: [0, 0, 0, 0, 0] };
  return { rating: Math.round((s.sum / s.count) * 10) / 10, reviewCount: s.count, dist: s.dist };
}

/** The deal's end time if it is still running, otherwise null (so an expired deal stops showing a countdown). */
const liveDeal = (p) => (p.dealEndsAt && new Date(p.dealEndsAt).getTime() > Date.now() ? p.dealEndsAt : null);

/** The listing shape: everything a product card, filter or search needs, and nothing else. */
export function toCard(p) {
  const { rating, reviewCount } = ratingFor(p.handle);
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    brand: p.brand,
    brandHandle: p.brandHandle,
    variant: p.variant,
    type: p.type,
    canMl: p.canMl,
    sugar: p.sugar,
    caffeine: p.caffeine,
    origin: p.origin,
    price: p.price,
    compareAt: p.compareAt,
    stock: p.stock,
    collections: p.collections,
    badges: p.badges,
    short: p.short,
    dealEndsAt: liveDeal(p),
    packs: p.packs.map((pk) => ({ ...pk, available: p.stock >= pk.qty })),
    sold: p.sold,
    createdAt: p.createdAt,
    images: p.images,
    tile: p.tile,
    ink: p.ink,
    rating,
    reviewCount,
  };
}

/** The product-page shape: the card plus the long description, tasting notes and rating distribution. */
export function toDetail(p) {
  const base = toCard(p);
  return {
    ...base,
    taste: p.taste,
    meter: p.meter,
    long: p.long,
    why: p.why,
    details: p.details,
    dist: ratingFor(p.handle).dist,
  };
}

/** Every product in card shape. */
export const allCards = () => products.get().map(toCard);
/** The stored product with this URL handle, or undefined. */
export const findProduct = (handle) => products.get().find((p) => p.handle === handle);

/** The collections with their current product counts. */
export function collectionList() {
  const list = products.get();
  return collections.get().map((c) => {
    const items = list.filter((p) => p.collections.includes(c.handle));
    return { ...c, count: items.length };
  });
}
