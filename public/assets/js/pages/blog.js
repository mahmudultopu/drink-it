import { $, html, raw, esc, initReveal } from '../ui.js';
import { Store } from '../store.js';
import { bannerHtml, crumbs } from '../sections.js';
import { blogCard } from '../blog-card.js';

export function init() {
  $('[data-blog-banner]').innerHTML = String(bannerHtml({ title: 'Our Blogs', text: 'Welcome to the Drink it blog — your go-to destination for everything cold, fizzy and refreshing. Party plans, can hacks, flavour guides and behind-the-scenes stories, all bubbling up here.' }));
  $('[data-crumbs]').innerHTML = String(crumbs([{ label: 'Home', href: '/' }, { label: 'News' }]));
  const sp = new URLSearchParams(location.search);
  const tag = sp.get('tag') || '';
  const q = (sp.get('q') || '').toLowerCase();
  const tags = [...new Set(Store.posts.map((p) => p.tag))];
  $('[data-blog-tags]').innerHTML = String(html`<strong>Topics:</strong><a class="pill pill--btn${tag ? '' : ' is-active'}" href="/blogs/news">All</a>${tags.map((t) => raw(`<a class="pill pill--btn${t === tag ? ' is-active' : ''}" href="/blogs/news?tag=${encodeURIComponent(t)}">${esc(t)}</a>`))}`);
  const list = Store.posts.filter((p) => (!tag || p.tag === tag) && (!q || `${p.title} ${p.excerpt}`.toLowerCase().includes(q)));
  $('[data-bloglist]').innerHTML = list.length
    ? String(html`${list.map((p) => blogCard(p, { date: true }))}`)
    : '<div class="empty" style="grid-column:1/-1"><h3>No articles found</h3><a class="btn" href="/blogs/news">See all articles</a></div>';
  initReveal();
}
