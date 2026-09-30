import { escapeHtml, safeUrl } from './html.js';

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

function hackerNewsMeta(item) {
  const score = Number(item.score || 0).toLocaleString('zh-TW');
  const comments = Number(item.comments || 0).toLocaleString('zh-TW');
  return `分數 ${score} · 留言 ${comments}`;
}

function sourceTag(item) {
  const label = item.sourceLabel || item.source;
  if (!label) return '';
  return `<button type="button" class="source-tag" data-source="${escapeHtml(item.source)}">${escapeHtml(label)}</button>`;
}

function techLinks(item) {
  const links = [];
  const url = safeUrl(item.url);
  const discussion = safeUrl(item.hnUrl);
  if (item.source === 'github' && url) {
    links.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">專案連結</a>`);
  }
  if (item.source === 'hackernews') {
    if (url) links.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">原文</a>`);
    if (discussion) links.push(`<a href="${escapeHtml(discussion)}" target="_blank" rel="noopener noreferrer">討論</a>`);
  }
  for (const link of item.links || []) {
    const href = safeUrl(link.url);
    if (!href) continue;
    links.push(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label || '連結')}</a>`);
  }
  return links.length ? `<p class="tech-links">${links.join('')}</p>` : '';
}

function diagramUrl(src) {
  const text = String(src || '');
  if (!/^data\/diagrams\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9][A-Za-z0-9._/-]*\.svg$/.test(text)) return '';
  if (text.split('/').some((part) => part === '..' || part === '.')) return '';
  return text;
}

function renderDiagram(item, lead) {
  const diagram = item.diagram;
  const src = diagramUrl(diagram?.src);
  if (!src) return '';
  return `<figure class="diagram${lead ? ' is-lead' : ''}">
    <img src="${escapeHtml(src)}" alt="${escapeHtml(diagram.alt)}" />
    <figcaption>${escapeHtml(diagram.caption)}</figcaption>
  </figure>`;
}

function renderTech(item, lead) {
  const title = item.source === 'hackernews'
    ? (item.titleZh || item.title)
    : (item.name || item.title);
  const original = item.source === 'hackernews' && item.title
    ? `<p class="original-title">${escapeHtml(item.title)}</p>`
    : '';
  const meta = item.source === 'hackernews' ? hackerNewsMeta(item) : githubMeta(item);
  const anchor = /^story-[A-Za-z0-9_-]+$/.test(item.anchor || '') ? ` id="${item.anchor}"` : '';
  return `<article${anchor} class="item${lead ? ' is-lead' : ''}" data-source="${escapeHtml(item.source)}">
    ${sourceTag(item)}
    <h3>${escapeHtml(title)}</h3>
    ${original}
    ${expandableSummary(item.summary, lead)}
    ${renderDiagram(item, lead)}
    <p class="meta">${escapeHtml(meta)}</p>
    ${techLinks(item)}
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
  return `<article class="item${lead ? ' is-lead' : ''}" data-source="${escapeHtml(item.source || '')}">
    ${sourceTag(item)}
    <h3>${title}</h3>
    ${item.summary ? `<p class="summary">${escapeHtml(item.summary)}</p>` : ''}
    ${links.length ? `<p class="tech-links">${links.join('')}</p>` : ''}
  </article>`;
}

function renderItem(section, item, index) {
  const lead = section.lead && index === 0;
  if (section.presentation === 'tech') return renderTech(item, lead);
  return renderGeneric(item, lead);
}

function renderFilters(section) {
  const sources = [];
  const seen = new Set();
  for (const item of section.items || []) {
    if (!item.source || seen.has(item.source)) continue;
    seen.add(item.source);
    sources.push({ id: item.source, label: item.sourceLabel || item.source });
  }
  if (sources.length < 2) return '';
  const buttons = [
    '<button type="button" class="source-filter is-active" data-source="" aria-pressed="true">全部</button>',
    ...sources.map((source) => (
      `<button type="button" class="source-filter" data-source="${escapeHtml(source.id)}" aria-pressed="false">${escapeHtml(source.label)}</button>`
    )),
  ];
  return `<div class="source-filters" role="group" aria-label="依來源篩選">${buttons.join('')}</div>`;
}

function humorUrl(src) {
  const text = String(src || '');
  if (!/^data\/humor\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9][A-Za-z0-9._-]*\.svg$/.test(text)) return '';
  if (text.split('/').includes('..')) return '';
  return text;
}

function renderHumor(section) {
  const panels = (section.humor || []).map((panel) => {
    const src = humorUrl(panel.src);
    if (!src) return '';
    return `<figure class="humor-panel">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(panel.alt)}" />
      <figcaption>${escapeHtml(panel.caption)}</figcaption>
      <p class="humor-link-line"><a class="humor-link" href="#${escapeHtml(panel.relatedAnchor)}">相關新聞：${escapeHtml(panel.relatedTitle)}</a></p>
    </figure>`;
  }).join('');
  if (!panels) return '';
  return `<aside class="humor-box" aria-label="今日一笑"><h3>今日一笑</h3>${panels}</aside>`;
}

function renderGrid(section, items, { lead = false, id = '' } = {}) {
  if (!items.length) return '';
  const columns = section.columns === 3 ? 'cols-3' : 'cols-2';
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
      ${renderFilters(section)}
      ${section.fallbackNote ? `<p class="fallback-note">${escapeHtml(section.fallbackNote)}</p>` : ''}
      ${section.notice ? `<p class="section-notice">${escapeHtml(section.notice)}</p>` : ''}
      ${section.emptyText ? `<p class="empty">${escapeHtml(section.emptyText)}</p>` : ''}
      ${renderGrid(section, section.items, { lead: section.lead })}
      ${renderHumor(section)}
      ${more}
    </section>`;
  }).join('');
}

export function renderNav(model) {
  return model.sections.map((section) => (
    `<a href="#section-${section.domId}">${escapeHtml(section.navLabel)}</a>`
  )).join('');
}

function applySourceFilter(section, source) {
  section.dataset.filter = source;
  section.querySelectorAll('.item').forEach((item) => {
    item.hidden = Boolean(source) && item.dataset.source !== source;
  });
  section.querySelectorAll('.source-filter').forEach((button) => {
    const on = (button.dataset.source || '') === source;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
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
  root.querySelectorAll('.paper-section').forEach((section) => {
    const choose = (source) => {
      const current = section.dataset.filter || '';
      applySourceFilter(section, source && source === current ? '' : source);
    };
    section.querySelectorAll('.source-filter, .source-tag').forEach((button) => {
      button.addEventListener('click', () => choose(button.dataset.source || ''));
    });
    section.querySelectorAll('.humor-link').forEach((link) => {
      link.addEventListener('click', () => applySourceFilter(section, ''));
    });
  });
}
