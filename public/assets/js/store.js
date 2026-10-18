// Client state: catalogue lookup, cart, wishlist, compare, recently viewed (persisted in localStorage).
import { toast } from './ui.js';

const KEYS = {
  cart: 'drinkit.cart.v1',
  wish: 'drinkit.wishlist.v1',
  compare: 'drinkit.compare.v1',
  recent: 'drinkit.recent.v1',
};
const bus = new EventTarget();

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export const Store = {
  site: null,
  user: null,
  products: [],
  byHandle: new Map(),
  collections: [],
  posts: [],

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
  pack(product, id) {
    return product.packs.find((p) => p.id === id) || product.packs[0];
  },

  // ---------- cart ----------
  cartItems() {
    return read(KEYS.cart, []);
  },
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
  cartCount() {
    return this.cartItems().reduce((s, i) => s + i.qty, 0);
  },
  cartSubtotal() {
    return this.cartLines().reduce((s, l) => s + l.total, 0);
  },
  /** max pack-quantity purchasable given stock and what is already in the cart for other packs */
  maxQty(handle, packId) {
    const product = this.get(handle);
    if (!product) return 0;
    const pack = this.pack(product, packId);
    const others = this.cartItems()
      .filter((i) => i.handle === handle && i.pack !== packId)
      .reduce((s, i) => s + i.qty * this.pack(product, i.pack).qty, 0);
    return Math.max(0, Math.min(99, Math.floor((product.stock - others) / pack.qty)));
  },
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
  wishlist() {
    return read(KEYS.wish, []).filter((h) => this.byHandle.has(h));
  },
  inWishlist(handle) {
    return this.wishlist().includes(handle);
  },
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
  brands() {
    const m = new Map();
    for (const p of this.products)
      if (!m.has(p.brandHandle)) m.set(p.brandHandle, { handle: p.brandHandle, name: p.brand, count: 0 });
    for (const p of this.products) m.get(p.brandHandle).count++;
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
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
