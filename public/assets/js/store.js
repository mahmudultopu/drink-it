// Client-side state: the catalogue for lookups, and the visitor's cart, wishlist, compare list and recently viewed
// items, which live in localStorage so they survive reloads (and are shared between tabs through the storage event).
// Prices shown from here are only for display; the server re-prices every order from its own catalogue.
import { toast } from './ui.js';

// localStorage keys. The version suffix lets a future change of format start from a clean slate.
const KEYS = {
  cart: 'drinkit.cart.v1',
  wish: 'drinkit.wishlist.v1',
  compare: 'drinkit.compare.v1',
  recent: 'drinkit.recent.v1',
};
const bus = new EventTarget(); // 'cart', 'wish', 'compare', 'recent' and 'cart:added' events

/** Read JSON from localStorage; storage that is unavailable (private mode) or corrupt behaves like an empty one. */
function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
/** Write JSON to localStorage, ignoring failures such as private mode or a full disk quota. */
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

/** How well a product matches the search words: 0 if any word is missing, otherwise higher is better. */
function searchScore(p, terms) {
  const title = p.title.toLowerCase();
  const haystack = [
    p.title,
    p.brand,
    p.variant,
    p.type,
    p.origin,
    p.sugar === 'Zero' ? 'zero sugar sugarfree' : '',
    p.caffeine ? 'energy caffeine' : '',
    p.collections.join(' '),
    `${p.canMl}ml ${p.canMl} ml`,
  ]
    .join(' ')
    .toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (!haystack.includes(t)) return 0;
    score += title.startsWith(t) ? 6 : title.includes(t) ? 4 : 1;
  }
  return score + p.sold / 10000;
}

/** The single shared store. Call Store.init() once with the catalogue before using anything else. */
export const Store = {
  site: null,
  user: null,
  products: [],
  byHandle: new Map(),
  collections: [],
  posts: [],

  /**
   * Load the catalogue and clean the saved cart of anything that has since disappeared from the shop (a removed
   * product or pack size), then start listening for changes made in other tabs.
   */
  init(boot) {
    this.site = boot.site;
    this.user = boot.user;
    this.products = boot.products;
    this.collections = boot.collections;
    this.posts = boot.posts;
    this.byHandle = new Map(boot.products.map((p) => [p.handle, p]));
    // drop anything that no longer exists in the catalogue
    const cart = read(KEYS.cart, []).filter(
      (i) => this.byHandle.has(i.handle) && this.byHandle.get(i.handle).packs.some((pk) => pk.id === i.pack),
    );
    write(KEYS.cart, cart);
    window.addEventListener('storage', (e) => {
      if (Object.values(KEYS).includes(e.key)) {
        bus.dispatchEvent(new Event('cart'));
        bus.dispatchEvent(new Event('wish'));
        bus.dispatchEvent(new Event('compare'));
      }
    });
  },

  /** Subscribe to a store event; returns the function that unsubscribes. */
  on(type, fn) {
    bus.addEventListener(type, fn);
    return () => bus.removeEventListener(type, fn);
  },
  emit(type) {
    bus.dispatchEvent(new Event(type));
  },

  get(handle) {
    return this.byHandle.get(handle);
  },
  /** A product's pack by id ('single', 'pack6', ...); falls back to the single can. */
  pack(product, id) {
    return product.packs.find((p) => p.id === id) || product.packs[0];
  },
  /**
   * Photo of a product in a given pack. The default size is for small slots (cart lines, option pickers): the single
   * can's thumbnail, or the small copy of a pack photo. 'card' gives the larger version used on product cards.
   */
  packImage(product, packId, size = 'thumb') {
    const { images } = product;
    if (packId === 'single') return size === 'card' ? images.card : images.thumb;
    return (size === 'card' ? images[packId] : images.small?.[packId] || images[packId]) || images.card;
  },

  // ---------- cart ----------
  // The cart stores only { handle, pack, qty }; everything else is looked up from the catalogue when needed.
  /** Raw cart rows. */
  cartItems() {
    return read(KEYS.cart, []);
  },
  /** Cart rows joined with their product and pack, with line totals, skipping products that no longer exist. */
  cartLines() {
    return this.cartItems()
      .map((i) => {
        const product = this.get(i.handle);
        if (!product) return null;
        const pack = this.pack(product, i.pack);
        return {
          handle: i.handle,
          product,
          pack,
          qty: i.qty,
          unit: pack.price,
          total: pack.price * i.qty,
          cans: pack.qty * i.qty,
        };
      })
      .filter(Boolean);
  },
  /** Number of packs in the cart (what the header badge shows). */
  cartCount() {
    return this.cartItems().reduce((s, i) => s + i.qty, 0);
  },
  cartSubtotal() {
    return this.cartLines().reduce((s, l) => s + l.total, 0);
  },
  /**
   * The most packs of this size that can be bought: stock (in cans) minus the cans already in the cart as other
   * pack sizes of the same product, divided by the pack size, and never more than 99.
   */
  maxQty(handle, packId) {
    const product = this.get(handle);
    if (!product) return 0;
    const pack = this.pack(product, packId);
    const others = this.cartItems()
      .filter((i) => i.handle === handle && i.pack !== packId)
      .reduce((s, i) => s + i.qty * this.pack(product, i.pack).qty, 0);
    return Math.max(0, Math.min(99, Math.floor((product.stock - others) / pack.qty)));
  },
  /**
   * Add packs to the cart, never beyond what is in stock. Tells the visitor when it had to stop short.
   * Emits 'cart:added' (which opens the cart drawer) unless `silent`. Returns false if nothing could be added.
   */
  addToCart(handle, packId = 'single', qty = 1, { silent = false } = {}) {
    const product = this.get(handle);
    if (!product) return false;
    const pack = this.pack(product, packId);
    const cart = this.cartItems();
    const row = cart.find((i) => i.handle === handle && i.pack === pack.id);
    const max = this.maxQty(handle, pack.id);
    const next = (row ? row.qty : 0) + qty;
    if (max < 1) {
      toast(`${product.title} is sold out.`, { type: 'error' });
      return false;
    }
    const finalQty = Math.min(next, max);
    if (finalQty < next) toast(`Only ${max} available — we added the maximum.`, { type: 'error' });
    if (row) row.qty = finalQty;
    else cart.push({ handle, pack: pack.id, qty: finalQty });
    write(KEYS.cart, cart);
    this.emit('cart');
    if (!silent) this.emit('cart:added');
    return true;
  },
  /** Set a cart row's quantity, between 1 and what the stock allows. */
  setQty(handle, packId, qty) {
    const cart = this.cartItems();
    const row = cart.find((i) => i.handle === handle && i.pack === packId);
    if (!row) return;
    const max = this.maxQty(handle, packId);
    row.qty = Math.max(1, Math.min(qty, max || 1));
    if (qty > max && max > 0) toast(`Only ${max} available in stock.`, { type: 'error' });
    write(KEYS.cart, cart);
    this.emit('cart');
  },
  removeFromCart(handle, packId) {
    write(
      KEYS.cart,
      this.cartItems().filter((i) => !(i.handle === handle && i.pack === packId)),
    );
    this.emit('cart');
  },
  clearCart() {
    write(KEYS.cart, []);
    this.emit('cart');
  },

  // ---------- wishlist / compare / recent ----------
  // These hold product handles only; handles of products that no longer exist are filtered out when read.
  wishlist() {
    return read(KEYS.wish, []).filter((h) => this.byHandle.has(h));
  },
  inWishlist(handle) {
    return this.wishlist().includes(handle);
  },
  /** Add or remove a product; returns true when it was added. */
  toggleWishlist(handle) {
    const list = read(KEYS.wish, []);
    const i = list.indexOf(handle);
    if (i >= 0) list.splice(i, 1);
    else list.unshift(handle);
    write(KEYS.wish, list);
    this.emit('wish');
    return i < 0;
  },
  compareList() {
    return read(KEYS.compare, []).filter((h) => this.byHandle.has(h));
  },
  /** Add or remove a product from the compare list (at most four): 'added', 'removed' or 'full'. */
  toggleCompare(handle) {
    const list = read(KEYS.compare, []);
    const i = list.indexOf(handle);
    if (i >= 0) {
      list.splice(i, 1);
      write(KEYS.compare, list);
      this.emit('compare');
      return 'removed';
    }
    if (list.length >= 4) return 'full';
    list.push(handle);
    write(KEYS.compare, list);
    this.emit('compare');
    return 'added';
  },
  recent() {
    return read(KEYS.recent, []).filter((h) => this.byHandle.has(h));
  },
  /** Remember a viewed product, most recent first, keeping the last twelve. */
  pushRecent(handle) {
    const list = read(KEYS.recent, []).filter((h) => h !== handle);
    list.unshift(handle);
    write(KEYS.recent, list.slice(0, 12));
    this.emit('recent');
  },
  clearRecent() {
    write(KEYS.recent, []);
    this.emit('recent');
  },

  // ---------- helpers ----------
  /** Brands in the catalogue with their number of cans, most cans first. */
  brands() {
    const m = new Map();
    for (const p of this.products)
      if (!m.has(p.brandHandle)) m.set(p.brandHandle, { handle: p.brandHandle, name: p.brand, count: 0 });
    for (const p of this.products) m.get(p.brandHandle).count++;
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  },
  /**
   * Products similar to `product`: shared collections count most, then the same brand, then the same type; ties go to
   * the better seller.
   */
  /**
   * Products matching every word of `query` - in the name, brand, flavour, type, origin, sugar, caffeine, collections
   * or can size - best match first. A word at the start of the title scores most, then one inside it, then one only
   * found elsewhere; ties go to the better seller. Used by the search overlay and the search page, so both agree.
   */
  search(query) {
    const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return this.products
      .map((p) => ({ p, score: searchScore(p, terms) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((hit) => hit.p);
  },
  related(product, n = 8) {
    const score = (p) =>
      p.collections.filter((c) => product.collections.includes(c)).length * 3 +
      (p.brand === product.brand ? 2 : 0) +
      (p.type === product.type ? 1 : 0);
    return this.products
      .filter((p) => p.handle !== product.handle)
      .sort((a, b) => score(b) - score(a) || b.sold - a.sold)
      .slice(0, n);
  },
};
