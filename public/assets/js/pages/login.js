// Sign in or create an account (one page, two tabs). After success the visitor is sent on to `?next=`.
import { $, $$, html } from '../ui.js';
import { Store } from '../store.js';
import { api } from '../api.js';

/** Only follow `next` to a path on this site; anything else (https://elsewhere, //elsewhere) goes to the account. */
const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/account');

export function init() {
  const sp = new URLSearchParams(location.search);
  const next = safeNext(sp.get('next'));
  if (Store.user) {
    location.replace(next);
    return;
  }
  const box = $('[data-auth]');
  let mode = location.pathname.endsWith('/register') ? 'register' : 'login';
  document.title = 'Account – Drink it';

  const render = () => {
    box.innerHTML =
      String(html`<div class="tabs" role="tablist"><button type="button" role="tab" class="${mode === 'login' ? 'is-active' : ''}" data-tab="login">Sign in</button><button type="button" role="tab" class="${mode === 'register' ? 'is-active' : ''}" data-tab="register">Create account</button></div>
    ${
      mode === 'login'
        ? html`<form data-form="login" novalidate>
      <div class="field"><label for="l-id">Mobile number or email</label><input class="input" id="l-id" name="id" autocomplete="username" required><div class="field__error" data-err="id"></div></div>
      <div class="field"><label for="l-pw">Password</label><input class="input" id="l-pw" name="password" type="password" autocomplete="current-password" required><div class="field__error" data-err="password"></div></div>
      <div class="form-note form-note--error" data-form-error hidden></div>
      <button class="btn btn--block" type="submit"><span>Sign in</span></button>
      <p class="muted center" style="font-size:15px">New here? <a href="#" data-tab="register" style="text-decoration:underline">Create an account</a> — or <a href="/checkout" style="text-decoration:underline">check out as a guest</a>.</p>
    </form>`
        : html`<form data-form="register" novalidate>
      <div class="field"><label for="r-name">Full name</label><input class="input" id="r-name" name="name" autocomplete="name" maxlength="80" required><div class="field__error" data-err="name"></div></div>
      <div class="field"><label for="r-phone">Mobile number</label><input class="input" id="r-phone" name="phone" type="tel" inputmode="tel" placeholder="01XXXXXXXXX" autocomplete="tel" required><div class="field__error" data-err="phone"></div></div>
      <div class="field"><label for="r-email">Email <span class="muted">(optional)</span></label><input class="input" id="r-email" name="email" type="email" autocomplete="email"><div class="field__error" data-err="email"></div></div>
      <div class="field"><label for="r-pw">Password</label><input class="input" id="r-pw" name="password" type="password" autocomplete="new-password" minlength="8" required><div class="field__error" data-err="password"></div></div>
      <div class="form-note form-note--error" data-form-error hidden></div>
      <button class="btn btn--block" type="submit"><span>Create account</span></button>
    </form>`
    }`);
    $$('[data-tab]', box).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        mode = b.dataset.tab;
        history.replaceState(null, '', `/account/${mode}${location.search}`);
        render();
      }),
    );
    const form = $('form', box);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      $$('[data-err]', form).forEach((x) => {
        x.textContent = '';
        x.closest('.field')?.classList.remove('has-error');
      });
      $('[data-form-error]', form).hidden = true;
      const fd = Object.fromEntries(new FormData(form));
      const btn = $('button[type=submit]', form);
      btn.classList.add('is-loading');
      try {
        await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: fd });
        location.href = next;
      } catch (err) {
        for (const [k, msg] of Object.entries(err.fields || {})) {
          const el = $(`[data-err="${k}"]`, form);
          if (el) {
            el.textContent = msg;
            el.closest('.field')?.classList.add('has-error');
          }
        }
        const note = $('[data-form-error]', form);
        if (!err.fields) {
          note.textContent = err.message;
          note.hidden = false;
        }
      } finally {
        btn.classList.remove('is-loading');
      }
    });
  };
  render();
}
