// Shared UI helpers: safe HTML templating, DOM helpers, formatting, icons, toasts, countdowns, scroll reveal and the
// small accessibility helpers used by dialogs and drawers.

// ---------------------------------------------------------------- safe HTML templating
//
// Pages are built from strings, so every value that ends up inside markup has to be escaped. Rather than rely on
// remembering to do that, the html`` tag escapes everything by default:
//
//   html`<h3>${product.title}</h3>`                  title is escaped
//   html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`   nested html`` results and arrays are inserted as they are
//   html`<span>${raw('<b>fixed markup</b>')}</span>`  raw() opts out, for markup the code itself wrote

/** Wrapper that marks a string as markup that is already safe to insert. */
class SafeHtml {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for use in element content and quoted attributes. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Mark a string as already-safe HTML. Only use it for markup the code built itself (with esc() where needed). */
export const raw = (s) => new SafeHtml(String(s ?? ''));

/** One interpolated value: nothing for null/undefined/false, arrays flattened, safe HTML as is, everything else escaped. */
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

// ---------------------------------------------------------------- DOM helpers

/** First element matching `sel` inside `root` (the document by default). */
export const $ = (sel, root = document) => root.querySelector(sel);

/** All elements matching `sel` inside `root`, as a real array. */
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** The n-th segment of the current URL path, decoded: pathSegment(2) on /products/sprite is "sprite". '' if absent. */
export function pathSegment(index) {
  try {
    return decodeURIComponent(location.pathname.split('/')[index] || '');
  } catch {
    return ''; // a malformed percent-escape in the address is treated like a missing segment
  }
}

/** Make `to` carry exactly the attributes of `from`. */
function copyAttributes(from, to) {
  for (const { name } of [...to.attributes]) if (!from.hasAttribute(name)) to.removeAttribute(name);
  for (const { name, value } of [...from.attributes]) if (to.getAttribute(name) !== value) to.setAttribute(name, value);
}

/**
 * Replace the content of `root` with `markup`, but leave one element exactly where it already is.
 *
 * The server renders the product photo into the page, and it is usually the largest thing on screen. If the script
 * replaced it with an identical new element, the browser would treat that as a fresh paint and report the page as
 * "loaded" much later. So the element `live` (and the chain of elements around it) stays in the document, and
 * everything beside that chain is swapped for the new markup. `selector` finds the matching element in the markup;
 * if the two do not line up (or point at different images) the content is simply replaced.
 * @param {Element} root container whose content is replaced
 * @param {string | { toString(): string }} markup new content (an html`` result or a string)
 * @param {Element | null} live element currently in `root` that should survive
 * @param {string} selector selector for its counterpart inside `markup`
 */
export function replaceKeeping(root, markup, live, selector) {
  const next = document.createElement('div');
  next.innerHTML = String(markup);
  const target = next.querySelector(selector);

  // walk both trees upwards in step; they must reach `root` and `next` together
  const pairs = [];
  let a = live;
  let b = target;
  while (a && b && a !== root && b !== next) {
    pairs.push([a, b]);
    a = a.parentElement;
    b = b.parentElement;
  }
  const sameShape = a === root && b === next && root.contains(live);
  if (!sameShape || live.getAttribute('src') !== target.getAttribute('src')) {
    root.replaceChildren(...next.childNodes);
    return;
  }

  // At each level keep the live element and swap the elements around it for the new ones.
  for (const [kept, fresh] of pairs) {
    const parent = kept.parentElement ?? root;
    const siblings = [...fresh.parentNode.childNodes];
    const at = siblings.indexOf(fresh);
    for (const old of [...parent.childNodes]) if (old !== kept) old.remove();
    kept.before(...siblings.slice(0, at));
    kept.after(...siblings.slice(at + 1));
    copyAttributes(fresh, kept);
  }
}

// ---------------------------------------------------------------- formatting

// Bangladeshi Taka, written the way it is in Bangladesh: ৳1,50,000 (lakh grouping), no decimals.
const takaFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const money = (n) => '৳' + takaFormat.format(Math.round(Number(n) || 0));

/** Percentage saved by `price` against a higher `compare` price (0 when there is no saving). */
export const discountPct = (price, compare) =>
  compare && compare > price ? Math.round((1 - price / compare) * 100) : 0;

/** Format an ISO date for display, e.g. "18 Oct 2026". */
export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(iso).toLocaleDateString('en-GB', opts);
}

/** Delay `fn` until calls have stopped for `ms` milliseconds (for typing, resizing...). */
export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

// ---------------------------------------------------------------- icons and ratings

/** An icon from the SVG sprite in assets/img/icons.svg. Decorative: hidden from screen readers. */
export const icon = (name, cls = '') =>
  raw(
    `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="/assets/img/icons.svg#${name}"/></svg>`,
  );

/** Star rating. The CSS masks two layers (outline and fill) and `--r` decides how much of the fill shows. */
export function stars(rating, cls = '') {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  return raw(
    `<span class="stars ${cls}" style="--r:${r}" role="img" aria-label="Rated ${r} out of 5"><i></i><b></b></span>`,
  );
}

// ---------------------------------------------------------------- responsive images

/**
 * URL of the narrower copy of a scene image (made by scripts/render/derive.mjs), e.g. blog-1.webp -> blog-1-480.webp.
 * A ?v= fingerprint on the original is kept: the copy is derived from it, so it changes exactly when the copy does.
 */
export function sized(url, width) {
  const [file, query] = url.split('?');
  return `${file.replace(/\.webp$/, `-${width}.webp`)}${query ? `?${query}` : ''}`;
}

/** `srcset` value for a scene image: its derived widths plus the original, whose width is `fullWidth`. */
export const srcset = (url, widths, fullWidth) =>
  [...widths.map((w) => `${sized(url, w)} ${w}w`), `${url} ${fullWidth}w`].join(', ');

// ---------------------------------------------------------------- toasts

let toastRoot;

/**
 * Show a short notice in the corner of the screen. It sits in a polite live region, so screen readers announce it
 * without interrupting. Options: `type` ('ok' | 'error'), `image` (thumbnail URL), `href` + `label` (a link) and
 * `ms` (how long it stays).
 */
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
  el.innerHTML = String(
    html`${image ? raw(`<img src="${esc(image)}" alt="">`) : ''}<span>${message}</span>${href ? raw(`<a href="${esc(href)}">${esc(label || 'View')}</a>`) : ''}`,
  );
  toastRoot.append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    setTimeout(() => el.remove(), 320);
  }, ms);
}

// ---------------------------------------------------------------- countdowns

/** Days / hours / minutes / seconds boxes for a deal that ends at `endsAt`. startCountdowns() keeps them ticking. */
export function countdownHtml(endsAt, cls = '') {
  return html`<div class="cd ${cls}" data-ends="${endsAt}" aria-label="Deal ends soon"><div><b data-cd="d">--</b><span>Days</span></div><i>:</i><div><b data-cd="h">--</b><span>Hours</span></div><i>:</i><div><b data-cd="m">--</b><span>Mins</span></div><i>:</i><div><b data-cd="s">--</b><span>Secs</span></div></div>`;
}

let countdownTimer;

/** Update every countdown on the page once a second, and remove the ones whose deal has ended. Safe to call again. */
export function startCountdowns() {
  const tick = () => {
    const now = Date.now();
    for (const el of document.querySelectorAll('.cd[data-ends]')) {
      const left = new Date(el.dataset.ends).getTime() - now;
      if (!(left > 0)) {
        el.remove();
        continue;
      }
      const parts = {
        d: Math.floor(left / 864e5),
        h: Math.floor((left % 864e5) / 36e5),
        m: Math.floor((left % 36e5) / 6e4),
        s: Math.floor((left % 6e4) / 1e3),
      };
      for (const [key, value] of Object.entries(parts)) {
        const box = el.querySelector(`[data-cd="${key}"]`);
        if (box) box.textContent = String(value).padStart(2, '0');
      }
    }
  };
  tick();
  if (!countdownTimer) countdownTimer = setInterval(tick, 1000);
}

// ---------------------------------------------------------------- scroll reveal

let revealObserver;

/**
 * Fade elements marked `data-reveal` in as they scroll into view (the effect itself is in the stylesheet). Without
 * IntersectionObserver they are simply shown. Call it again after rendering new content.
 */
export function initReveal(root = document) {
  const els = root.querySelectorAll('[data-reveal]:not(.is-in)');
  if (!('IntersectionObserver' in window)) {
    els.forEach((e) => e.classList.add('is-in'));
    return;
  }
  revealObserver ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          revealObserver.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  els.forEach((e) => revealObserver.observe(e));
}

// ---------------------------------------------------------------- print buttons

let printBound = false;

/**
 * Make any button marked `data-print` open the browser's print dialog. (An inline onclick="window.print()" would be
 * blocked by the Content-Security-Policy, which allows no inline scripts.) One delegated handler covers every button,
 * including ones added later.
 */
export function bindPrintButtons() {
  if (printBound) return;
  printBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-print]')) window.print();
  });
}

// ---------------------------------------------------------------- dialogs

/** Stop (or allow) the page behind a drawer or dialog from scrolling. */
export function lockScroll(on) {
  document.body.classList.toggle('no-scroll', on);
}

/**
 * Keep keyboard focus inside a dialog or drawer: call it from a keydown handler. Tab on the last control wraps to the
 * first one and Shift+Tab on the first wraps to the last.
 */
export function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const focusable = [
    ...container.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((x) => x.offsetParent !== null); // visible ones only
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
