export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function safeUrl(value) {
  try {
    const url = new URL(String(value), 'https://example.invalid');
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return '';
  }
  return '';
}

export function clip(text, max) {
  const chars = [...String(text || '')];
  if (chars.length <= max) return chars.join('');
  return `${chars.slice(0, max).join('')}…`;
}

export function headlineAndSummary(text, neutralTitle) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (neutralTitle) {
    return {
      title: clip(String(neutralTitle).replace(/\s+/g, ' ').trim(), 80),
      summary: clip(clean, 120),
    };
  }
  if (!clean) return { title: '', summary: '' };
  const match = clean.match(/^(.+?[。！？!?])\s*([\s\S]*)$/);
  if (!match) return { title: clip(clean, 80), summary: '' };
  return {
    title: clip(match[1].trim(), 80),
    summary: clip(match[2].trim(), 120),
  };
}
