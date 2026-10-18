import { $, html, raw, esc, icon, fmtDate, toast, initReveal } from '../ui.js';
import { Store } from '../store.js';
import { api } from '../api.js';
import { bannerHtml, crumbs } from '../sections.js';
import { blogCard } from '../blog-card.js';

export async function init() {
  const handle = decodeURIComponent(location.pathname.split('/')[3] || '');
  const root = $('[data-article-root]');
  let data;
  try { data = await api('/posts/' + handle); } catch { root.innerHTML = '<div class="empty"><h3>We couldn’t find that article</h3><a class="btn" href="/blogs/news">Back to the blog</a></div>'; return; }
  const { post: p, related } = data;
  document.title = `${p.title} – Drink it`;
  const url = encodeURIComponent(location.href);
  const tags = [...new Set(Store.posts.map((x) => x.tag))];
  root.innerHTML = String(html`<section class="banner">${bannerHtml({ title: p.title, text: p.excerpt })}</section>
  ${crumbs([{ label: 'Home', href: '/' }, { label: 'News', href: '/blogs/news' }, { label: p.title }])}
  <div class="article">
    <article>
      <div class="article__hero"><img src="${p.image}" alt="" width="960" height="540"></div>
      <div class="article__meta"><span class="pill">${p.tag}</span><span>${fmtDate(p.date, { day: 'numeric', month: 'long', year: 'numeric' })}</span><span>${p.read} min read</span></div>
      <div class="rte">${raw(p.body)}</div>
      <div class="article__foot">
        <div class="author"><span class="author__avatar">${p.author.name[0]}</span><div><b>${p.author.role}</b>${p.author.name}</div></div>
        <div class="sharebtns"><span>Share this blog</span>
          <a class="round-btn round-btn--sm" href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener" aria-label="Share on Facebook">${icon('facebook')}</a>
          <a class="round-btn round-btn--sm" href="https://wa.me/?text=${encodeURIComponent(p.title)}%20${url}" target="_blank" rel="noopener" aria-label="Share on WhatsApp">${icon('whatsapp')}</a>
          <a class="round-btn round-btn--sm" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(p.title)}&url=${url}" target="_blank" rel="noopener" aria-label="Share on X">${icon('x-social')}</a>
          <button class="round-btn round-btn--sm" type="button" data-copy aria-label="Copy link">${icon('share')}</button>
        </div>
      </div>
    </article>
    <aside class="sidebar">
      <div class="sidebox"><h3>Subscribe For More</h3><form action="/blogs/news" method="get" role="search"><label class="sr-only" for="bq">Search articles</label><input class="input" id="bq" name="q" type="search" placeholder="Search blog articles…"></form></div>
      <div class="sidebox"><h3>Recent Posts</h3><ul class="recent">${Store.posts.filter((x) => x.handle !== p.handle).slice(0, 4).map((x) => html`<li><a href="/blogs/news/${x.handle}"><img src="${x.image}" alt="" loading="lazy"><b>${x.title}</b></a></li>`)}</ul></div>
      <div class="sidebox"><h3>Tags</h3><div class="taglist">${tags.map((t) => raw(`<a class="pill pill--btn" href="/blogs/news?tag=${encodeURIComponent(t)}">${esc(t)}</a>`))}</div></div>
    </aside>
  </div>
  <section class="sec" style="padding-top:100px"><div class="sec-head"><p class="eyebrow">Keep Exploring</p><h2>More Juicy Reads You’ll Love</h2></div><div class="bloglist">${related.map((x) => blogCard(x))}</div></section>`);
  $('[data-copy]', root).addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); toast('Link copied to clipboard.'); } catch { toast('Copy the link from your address bar.', { type: 'error' }); } });
  initReveal();
}
