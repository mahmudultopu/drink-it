// Product serialisation for the storefront (cards vs. full detail) + review statistics.
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

export function ratingFor(handle) {
  const s = stats().get(handle);
  if (!s) return { rating: 0, reviewCount: 0, dist: [0, 0, 0, 0, 0] };
  return { rating: Math.round((s.sum / s.count) * 10) / 10, reviewCount: s.count, dist: s.dist };
}

const liveDeal = (p) => (p.dealEndsAt && new Date(p.dealEndsAt).getTime() > Date.now() ? p.dealEndsAt : null);

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

export const allCards = () => products.get().map(toCard);
export const findProduct = (handle) => products.get().find((p) => p.handle === handle);

export function collectionList() {
  const list = products.get();
  return collections.get().map((c) => {
    const items = list.filter((p) => p.collections.includes(c.handle));
    return { ...c, count: items.length };
  });
}
