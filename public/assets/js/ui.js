// Shared UI helpers: safe HTML templating, formatting, icons, toast, countdown.

class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
/** Mark a string as already-safe HTML. */
export const raw = (s) => new SafeHtml(String(s ?? ''));
const part = (v) => {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (v instanceof SafeHtml) return v.s;
  return esc(v);
};
/** Tagged template: interpolated values are HTML-escaped unless wrapped in raw() or produced by html``. */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const money = (n) => '৳' + nf.format(Math.round(Number(n) || 0));
export const moneyExact = (n) => '৳' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n) || 0);

export const icon = (name, cls = '') => raw(`<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/img/icons.svg#${name}"/></svg>`);

export function stars(rating, cls = '') {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  return raw(`<span class="stars ${cls}" style="--r:${r}" role="img" aria-label="Rated ${r} out of 5"><i></i><b></b></span>`);
}

export const discountPct = (price, compare) => (compare && compare > price ? Math.round((1 - price / compare) * 100) : 0);

export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(iso).toLocaleDateString('en-GB', opts);
}

export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

// ---------- toasts ----------
let toastRoot;
export function toast(message, { type = 'ok', image, href, label, ms = 3600 } = {}) {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toasts';
    toastRoot.setAttribute('role', 'status');
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.append(toastRoot);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' toast--error' : '');
  el.innerHTML = String(html`${image ? raw(`<img src="${esc(image)}" alt="">`) : ''}<span>${message}</span>${href ? raw(`<a href="${esc(href)}">${esc(label || 'View')}</a>`) : ''}`);
  toastRoot.append(el);
  setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; setTimeout(() => el.remove(), 320); }, ms);
}

// ---------- countdown ----------
export function countdownHtml(endsAt, cls = '') {
  return html`<div class="cd ${cls}" data-ends="${endsAt}" aria-label="Deal ends soon"><div><b data-cd="d">--</b><span>Days</span></div><i>:</i><div><b data-cd="h">--</b><span>Hours</span></div><i>:</i><div><b data-cd="m">--</b><span>Mins</span></div><i>:</i><div><b data-cd="s">--</b><span>Secs</span></div></div>`;
}
let cdTimer;
export function startCountdowns(root = document) {
  const tick = () => {
    const now = Date.now();
    for (const el of document.querySelectorAll('.cd[data-ends]')) {
      const left = new Date(el.dataset.ends).getTime() - now;
      if (!(left > 0)) { el.remove(); continue; }
      const d = Math.floor(left / 864e5), h = Math.floor((left % 864e5) / 36e5), m = Math.floor((left % 36e5) / 6e4), s = Math.floor((left % 6e4) / 1e3);
      const set = (k, v) => { const n = el.querySelector(`[data-cd="${k}"]`); if (n) n.textContent = String(v).padStart(2, '0'); };
      set('d', d); set('h', h); set('m', m); set('s', s);
    }
  };
  tick();
  if (!cdTimer) cdTimer = setInterval(tick, 1000);
}

// ---------- scroll reveal ----------
let io;
export function initReveal(root = document) {
  const els = root.querySelectorAll('[data-reveal]:not(.is-in)');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  io = io || new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));
}

export function lockScroll(on) { document.body.classList.toggle('no-scroll', on); }

/** Simple focus trap for dialogs/drawers. */
export function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const f = [...container.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function slugify(s) { return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
