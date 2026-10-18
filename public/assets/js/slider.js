// Sliders: the crossfading hero + simple scroll-snap track sliders with arrow buttons.
import { $, $$ } from './ui.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Cross-fading hero with arrows, dots and gentle autoplay. */
export function initHero(root = document.querySelector('[data-hero]'), { autoplay = 6500 } = {}) {
  if (!root) return null;
  const slides = $$('.hero__slide, .hero2__slide', root);
  if (!slides.length) return null;
  const dotsEl = $('[data-hero-dots]', root);
  let i = Math.max(
    0,
    slides.findIndex((s) => s.classList.contains('is-active')),
  );
  let timer = null;
  let paused = false;

  const dots = slides.map((_, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Go to slide ${k + 1}`);
    b.addEventListener('click', () => go(k, true));
    dotsEl?.append(b);
    return b;
  });
  const go = (n, user = false) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => {
      s.classList.toggle('is-active', k === i);
      s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
    });
    dots.forEach((d, k) => {
      d.classList.toggle('is-active', k === i);
      d.setAttribute('aria-current', k === i ? 'true' : 'false');
    });
    if (user) restart();
  };
  const next = () => go(i + 1);
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  const start = () => {
    if (autoplay && !reduceMotion() && !timer && slides.length > 1)
      timer = setInterval(() => {
        if (!paused && !document.hidden) next();
      }, autoplay);
  };
  const restart = () => {
    stop();
    start();
  };
  $('[data-hero-prev]', root)?.addEventListener('click', () => go(i - 1, true));
  $('[data-hero-next]', root)?.addEventListener('click', () => go(i + 1, true));
  root.addEventListener('mouseenter', () => {
    paused = true;
  });
  root.addEventListener('mouseleave', () => {
    paused = false;
  });
  root.addEventListener('focusin', () => {
    paused = true;
  });
  root.addEventListener('focusout', () => {
    paused = false;
  });
  // swipe
  let sx = 0;
  root.addEventListener(
    'touchstart',
    (e) => {
      sx = e.touches[0].clientX;
    },
    { passive: true },
  );
  root.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1), true);
  });
  go(i);
  start();
  return { go, next, stop };
}

/** Scroll-snap track with prev/next buttons (buttons are found inside `root`). */
export function initTrack(root) {
  const track = $('.slider__track', root);
  if (!track) return;
  const prev = $('[data-prev]', root),
    next = $('[data-next]', root);
  const step = () => {
    const first = track.firstElementChild;
    if (!first) return track.clientWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap || '0') || 0;
    return first.getBoundingClientRect().width + gap;
  };
  const update = () => {
    const max = track.scrollWidth - track.clientWidth - 2;
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = track.scrollLeft >= max;
    if (prev && next) {
      const hide = max <= 0;
      prev.hidden = hide;
      next.hidden = hide;
    }
  };
  prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  window.addEventListener('resize', update);
  update();
  return { update };
}
