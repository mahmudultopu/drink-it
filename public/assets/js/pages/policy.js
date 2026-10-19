import { $, pathSegment } from '../ui.js';
import { api } from '../api.js';

export async function init() {
  const handle = pathSegment(2);
  try {
    const { page } = await api('/pages/' + encodeURIComponent(handle));
    document.title = `${page.title} – Drink it`;
    // trusted: policy text is authored by the shop in data/pages.json, never by visitors
    $('[data-policy-body]').innerHTML = page.body || '';
  } catch {
    $('.banner h1').textContent = 'Page not found';
    $('.banner p').textContent = '';
    $('[data-policy-body]').innerHTML = '<p>We couldn’t find that page. <a href="/">Go home</a>.</p>';
  }
}
