import { $ } from '../ui.js';
import { api } from '../api.js';
import { bannerHtml, accordionHtml } from '../sections.js';

export async function init() {
  $('[data-faq-banner]').innerHTML = String(
    bannerHtml({
      title: 'FAQ’s',
      text: 'Quick answers to the questions we hear most about orders, delivery, payments and our cans.',
    }),
  );
  try {
    const { faq } = await api('/faq');
    $('[data-faq]').innerHTML = String(accordionHtml(faq));
    $('.acc__item')?.classList.add('is-open');
  } catch {
    /* optional */
  }
}
