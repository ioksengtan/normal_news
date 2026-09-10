async function fetchJson(path, fallback) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function formatDate(iso) {
  if (!iso) return '未知時間';
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// 極簡 markdown 轉換：只處理準則頁會用到的 **粗體**、- 清單、段落
function renderMarkdown(text) {
  const blocks = text.trim().split(/\n\n+/);
  return blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      const isList = lines.every((l) => l.startsWith('- '));
      const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      if (isList) {
        return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p>${inline(lines.join(' '))}</p>`;
    })
    .join('\n');
}

async function renderArticleList() {
  const container = document.getElementById('article-list');
  if (!container) return;

  const articles = await fetchJson('data/articles.json', []);
  const banner = document.getElementById('example-banner');
  if (banner) banner.hidden = !articles.some((a) => a.isExample);

  if (articles.length === 0) {
    container.innerHTML = '<div class="empty-state">目前還沒有處理過的新聞，等 GitHub Actions 排程跑過一輪就會出現在這裡。</div>';
    return;
  }

  container.innerHTML = articles
    .map((a) => {
      const spans = (a.removedSpans || [])
        .map(
          (s) => `
        <div class="removed-span">
          <span class="category">${escapeHtml(s.category || '')}</span>
          <span>
            <span class="original">${escapeHtml(s.original || '')}</span>
            <span class="note">${escapeHtml(s.note || '')}</span>
          </span>
        </div>`
        )
        .join('');

      return `
      <article class="article">
        <div class="article-meta">
          <span>${escapeHtml(a.source || '未知來源')}</span>
          <span>·</span>
          <span>${formatDate(a.publishedAt)}</span>
          <span class="bias-badge">情緒密度 ${Math.round((a.biasRatio || 0) * 100)}%</span>
        </div>
        <h2><a href="${escapeHtml(a.link || '#')}" style="color:inherit;text-decoration:none;">${escapeHtml(a.title || '')}</a></h2>
        <p class="neutral-text">${escapeHtml(a.neutralText || '')}</p>
        <details>
          <summary>查看被移除的 ${(a.removedSpans || []).length} 個片段</summary>
          ${spans || '<p class="note">這篇文章沒有被標記任何情緒/立場用語。</p>'}
        </details>
      </article>`;
    })
    .join('\n');
}

async function renderRanking() {
  const container = document.getElementById('ranking-list');
  if (!container) return;

  const stats = await fetchJson('data/source_stats.json', []);
  const banner = document.getElementById('example-banner');
  if (banner) banner.hidden = !stats.some((s) => s.isExample);

  if (stats.length === 0) {
    container.innerHTML = '<div class="empty-state">還沒有足夠的資料可以排名。</div>';
    return;
  }

  const max = Math.max(...stats.map((s) => s.avgBiasRatio), 0.01);

  container.innerHTML = stats
    .map(
      (s, i) => `
    <div class="ranking-row">
      <span class="rank">${i + 1}</span>
      <span class="source-name">${escapeHtml(s.source)}<br><span style="font-weight:400;color:var(--ink-soft);font-size:12px;">${s.articleCount} 篇</span></span>
      <span class="bar-track"><span class="bar-fill" style="width:${(s.avgBiasRatio / max) * 100}%"></span></span>
      <span class="ratio">${(s.avgBiasRatio * 100).toFixed(1)}%</span>
    </div>`
    )
    .join('\n');
}

async function renderCriteria() {
  const container = document.getElementById('criteria-body');
  if (!container) return;

  const criteria = await fetchJson('data/criteria.json', null);
  const meta = document.getElementById('criteria-meta');

  if (!criteria) {
    container.innerHTML = '<div class="empty-state">準則資料還沒有產生。</div>';
    return;
  }

  if (meta) {
    meta.textContent = `rubric-spec.md · v${criteria.version} · 最後更新 ${criteria.updatedAt || '未知'}`;
  }
  container.innerHTML = renderMarkdown(criteria.summary || '');
}

renderArticleList();
renderRanking();
renderCriteria();
