import { html, fmtDate } from './ui.js';

export function blogCard(p, { date = false } = {}) {
  return html`<article class="bcard" data-reveal="up">
  <a class="bcard__img" href="/blogs/news/${p.handle}" aria-label="${p.title}"><img src="${p.image}" alt="" loading="lazy" width="447" height="268"></a>
  ${date ? html`<span class="bcard__date">${fmtDate(p.date)} · ${p.read} min read</span>` : ''}
  <span class="pill bcard__tag">${p.tag}</span>
  <h3 class="bcard__title"><a href="/blogs/news/${p.handle}">${p.title}</a></h3>
  <a class="bcard__more" href="/blogs/news/${p.handle}">Read More</a>
</article>`;
}
