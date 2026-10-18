import { $ } from '../ui.js';
import { api } from '../api.js';
import { accordionHtml } from '../sections.js';

export async function init() {
  try {
    const { faq } = await api('/faq');
    $('[data-faq]').innerHTML = String(accordionHtml(faq));
    $('.acc__item')?.classList.add('is-open');
  } catch {
    /* optional */
  }
}
