import { $, $$, html, toast, initReveal } from '../ui.js';
import { api } from '../api.js';
import { bannerHtml, accordionHtml } from '../sections.js';

export async function init() {
  $('[data-contact-banner]').innerHTML = String(bannerHtml({ title: 'Contact Us', text: 'Have questions, feedback, or just want to say hello? We’re always happy to hear from you! Reach out to us anytime — our team is here to help with orders, delivery, bulk events or anything else you need.' }));
  const form = $('[data-contact-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $$('[data-err]', form).forEach((x) => { x.textContent = ''; x.closest('.field')?.classList.remove('has-error'); });
    $('[data-form-error]', form).hidden = true; $('[data-form-ok]', form).hidden = true;
    const btn = $('button[type=submit]', form);
    btn.classList.add('is-loading');
    try {
      const r = await api('/contact', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      const ok = $('[data-form-ok]', form); ok.textContent = r.message; ok.hidden = false; form.reset();
    } catch (err) {
      for (const [k, m] of Object.entries(err.fields || {})) { const el = $(`[data-err="${k}"]`, form); if (el) { el.textContent = m; el.closest('.field')?.classList.add('has-error'); } }
      if (!err.fields) { const n = $('[data-form-error]', form); n.textContent = err.message; n.hidden = false; }
    } finally { btn.classList.remove('is-loading'); }
  });
  try { const { faq } = await api('/faq'); $('[data-faq]').innerHTML = String(accordionHtml(faq.slice(0, 6))); } catch { /* optional */ }
  initReveal();
}
