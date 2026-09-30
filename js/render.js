import { escapeHtml, headlineAndSummary, safeUrl } from './html.js';
import { formatHM } from './time.js';

function sourceLine(sources, updatedAt) {
  const links = (sources || []).map((source) => {
    const url = safeUrl(source.url);
    const name = escapeHtml(source.name || '未知來源');
    return url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
      : name;
  });
  const time = updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? formatHM(new Date(updatedAt)) : '';
  if (links.length === 0 && !time) return '';
  const sourceText = links.length ? `來源：${links.join('、')}` : '';
  return `<p class="meta">${sourceText}${sourceText && time ? ' · ' : ''}${escapeHtml(time)}</p>`;
}

function renderArticleCard(item, lead) {
  return `<article class="item${lead ? ' is-lead' : ''}">
    <h3><a href="article.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></h3>
    ${item.summary ? `<p class="summary">${escapeHtml(item.summary)}</p>` : ''}
    ${sourceLine(item.sources, item.updatedAt)}
  </article>`;
}

function expandableSummary(summary, lead = false) {
  if (!summary) return '';
  if (lead || [...summary].length <= 72) return `<p class="summary">${escapeHtml(summary)}</p>`;
  return `<p class="summary clamp">${escapeHtml(summary)}</p><button type="button" class="expand">展開</button>`;
}

function githubMeta(item) {
  const language = item.language || '未標示';
  const today = item.starsToday == null
    ? '今日 —'
    : `今日 +${Number(item.starsToday).toLocaleString('zh-TW')}`;
  const total = item.stars == null ? '' : ` · 共 ${Number(item.stars).toLocaleString('zh-TW')} 星`;
  return `${language} · ${today}${total}`;
}

function renderGithub(item, lead) {
  const url = safeUrl(item.url);
  const link = url
    ? `<p class="tech-links"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">專案連結</a></p>`
    : '';
  return `<article class="item${lead ? ' is-lead' : ''}">
    <h3>${escapeHtml(item.name || item.title)}</h3>
    ${expandableSummary(item.summary, lead)}
    <p class="meta">${escapeHtml(githubMeta(item))}</p>
    ${link}
  </article>`;
}

function renderHackerNews(item) {
  const links = [];
  const source = safeUrl(item.url);
  const discussion = safeUrl(item.hnUrl);
  if (source) links.push(`<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">原文</a>`);
  if (discussion) links.push(`<a href="${escapeHtml(discussion)}" target="_blank" rel="noopener noreferrer">討論</a>`);
  const score = Number(item.score || 0).toLocaleString('zh-TW');
  const comments = Number(item.comments || 0).toLocaleString('zh-TW');
  return `<article class="item">
    <h3>${escapeHtml(item.titleZh || item.title)}</h3>
    ${item.title ? `<p class="original-title">${escapeHtml(item.title)}</p>` : ''}
    ${expandableSummary(item.summary)}
    <p class="meta">分數 ${score} · 留言 ${comments}</p>
    ${links.length ? `<p class="tech-links">${links.join('')}</p>` : ''}
  </article>`;
}

function renderGeneric(item, lead) {
  const url = safeUrl(item.url);
  const title = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
    : escapeHtml(item.title);
  const links = (item.links || []).map((link) => {
    const href = safeUrl(link.url);
    if (!href) return '';
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label || '連結')}</a>`;
  }).filter(Boolean);
  return `<article class="item${lead ? ' is-lead' : ''}">
    <h3>${title}</h3>
    ${item.summary ? `<p class="summary">${escapeHtml(item.summary)}</p>` : ''}
    ${links.length ? `<p class="tech-links">${links.join('')}</p>` : ''}
  </article>`;
}

function renderItem(section, item, index) {
  const lead = section.lead && index === 0;
  if (section.presentation === 'github') return renderGithub(item, lead);
  if (section.presentation === 'hackernews') return renderHackerNews(item);
  if (section.presentation === 'article') return renderArticleCard(item, lead);
  return renderGeneric(item, lead);
}

function renderGrid(section, items, { lead = false, id = '' } = {}) {
  if (!items.length) return '';
  const columns = section.columns === 2 ? 'cols-2' : 'cols-3';
  const attrs = `${id ? ` id="${id}"` : ''}${id ? ' hidden' : ''}`;
  return `<div${attrs} class="grid ${columns}${lead ? ' has-lead' : ''}">${
    items.map((item, index) => renderItem({ ...section, lead }, item, index)).join('')
  }</div>`;
}

export function renderSections(model) {
  return model.sections.map((section) => {
    const moreId = `more-${section.domId}`;
    const more = section.moreItems?.length
      ? `${renderGrid(section, section.moreItems, { id: moreId })}
         ${section.moreLabel ? `<button type="button" class="more" data-more="${moreId}">${escapeHtml(section.moreLabel)}</button>` : ''}`
      : '';
    return `<section id="section-${section.domId}" class="paper-section" data-section="${escapeHtml(section.domId)}" aria-labelledby="heading-${section.domId}">
      <div class="section-head"><h2 id="heading-${section.domId}">${escapeHtml(section.name)}</h2></div>
      ${section.fallbackNote ? `<p class="fallback-note">${escapeHtml(section.fallbackNote)}</p>` : ''}
      ${section.notice ? `<p class="section-notice">${escapeHtml(section.notice)}</p>` : ''}
      ${section.emptyText ? `<p class="empty">${escapeHtml(section.emptyText)}</p>` : ''}
      ${renderGrid(section, section.items, { lead: section.lead })}
      ${more}
    </section>`;
  }).join('');
}

export function renderNav(model) {
  return model.sections.map((section) => (
    `<a href="#section-${section.domId}">${escapeHtml(section.navLabel)}</a>`
  )).join('');
}

export function bindPaper(root) {
  root.querySelectorAll('[data-more]').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = root.querySelector(`#${CSS.escape(button.dataset.more)}`);
      if (panel) panel.hidden = false;
      button.hidden = true;
    });
  });
  root.querySelectorAll('.expand').forEach((button) => {
    button.addEventListener('click', () => {
      const summary = button.parentElement.querySelector('.summary');
      if (!summary) return;
      const collapsed = summary.classList.toggle('clamp');
      button.textContent = collapsed ? '展開' : '收合';
    });
  });
}

export function reportUrl(repository, template, pageUrl, title) {
  const base = String(repository || '').replace(/\/$/, '');
  const params = new URLSearchParams({
    template: template || 'article-report.yml',
    title: `回報問題：${title || ''}`.slice(0, 80),
    body: `頁面：${pageUrl || ''}\n\n`,
  });
  return `${base}/issues/new?${params.toString()}`;
}

function paragraphs(text) {
  return String(text || '')
    .trim()
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function renderArticle(event, config, pageUrl) {
  if (!event) return '<p class="empty">找不到這則新聞。</p>';
  const { title } = headlineAndSummary(event.neutralText, event.neutralTitle);
  const body = paragraphs(event.neutralText).map((part) => `<p>${escapeHtml(part)}</p>`).join('');
  const sources = (event.sources || []).map((source) => {
    const url = safeUrl(source.url);
    const name = escapeHtml(source.name || '來源');
    return url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
      : name;
  }).join('、');
  const report = reportUrl(config?.repository, config?.issueForm, pageUrl, title || '新聞');
  return `<h2>${escapeHtml(title || '新聞')}</h2>
    <div class="article-body">${body}</div>
    ${sources ? `<p class="source-list">原文：${sources}</p>` : ''}
    <p class="report"><a href="${escapeHtml(report)}">回報問題</a></p>`;
}
