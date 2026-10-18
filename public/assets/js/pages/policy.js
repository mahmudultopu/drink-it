import { $, raw } from '../ui.js';
import { api } from '../api.js';
import { bannerHtml } from '../sections.js';

export async function init() {
  const handle = location.pathname.split('/')[2];
  try {
    const { page } = await api('/pages/' + handle);
    document.title = `${page.title} – Drink it`;
    $('[data-policy-banner]').innerHTML = String(bannerHtml({ title: page.title, text: 'Last updated October 2026.' }));
    $('[data-policy-body]').innerHTML = page.body || '';
  } catch {
    $('[data-policy-banner]').innerHTML = String(bannerHtml({ title: 'Page not found', text: '' }));
    $('[data-policy-body]').innerHTML = '<p>We couldn’t find that page. <a href="/">Go home</a>.</p>';
  }
}
