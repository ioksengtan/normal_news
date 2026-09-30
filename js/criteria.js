function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function inline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(text) {
  const blocks = String(text || '').trim().split(/\n\n+/);
  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
      const level = lines[0].startsWith('###') ? 3 : lines[0].startsWith('##') ? 2 : 1;
      return `<h${level}>${inline(lines[0].replace(/^#{1,3}\s+/, ''))}</h${level}>`;
    }
    if (lines[0]?.startsWith('```')) {
      const code = lines.slice(1, lines.at(-1) === '```' ? -1 : undefined).join('\n');
      return `<pre>${escapeHtml(code)}</pre>`;
    }
    const isList = lines.every((line) => line.startsWith('- '));
    if (isList) {
      return `<ul>${lines.map((line) => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
    }
    return `<p>${inline(lines.join(' '))}</p>`;
  }).join('\n');
}

function renderFunding(sources) {
  const enabled = (Array.isArray(sources) ? sources : []).filter((source) => source && source.enabled !== false && source.fundingNote);
  if (enabled.length === 0) return '';
  const items = enabled.map((source) => (
    `<li><strong>${inline(source.source || source.id || '來源')}</strong>：${inline(source.fundingNote)}</li>`
  )).join('');
  return `<h2>各來源的出資與所有權</h2>\n<ul>${items}</ul>`;
}

async function main() {
  const body = document.getElementById('criteria-body');
  const meta = document.getElementById('criteria-meta');
  if (!body) return;
  try {
    const [criteriaResponse, sourcesResponse] = await Promise.all([
      fetch('data/criteria.json', { cache: 'no-store' }),
      fetch('config/sources.json', { cache: 'no-store' }),
    ]);
    if (!criteriaResponse.ok) throw new Error('criteria');
    const criteria = await criteriaResponse.json();
    let funding = '';
    if (sourcesResponse.ok) {
      const config = await sourcesResponse.json();
      funding = renderFunding(config.sources);
    }
    if (meta) meta.textContent = `版本 ${criteria.version || '—'} · 最後更新 ${criteria.updatedAt || '未知'}`;
    body.innerHTML = `${renderMarkdown(criteria.summary || '')}\n${funding}`;
  } catch {
    body.innerHTML = '<p class="empty">準則資料還沒有產生。</p>';
  }
}

main();
