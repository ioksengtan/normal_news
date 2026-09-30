import { buildPaper } from './paper.js';
import { bindPaper, renderNav, renderSections } from './render.js';
import { taipeiDateString } from './time.js';

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function pickIssue(issues, today) {
  const list = Array.isArray(issues) ? issues : [];
  return list.find((issue) => issue.date === today)
    || list.filter((issue) => issue.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    || null;
}

async function main() {
  const dateline = document.getElementById('dateline');
  const nav = document.getElementById('section-nav');
  const sections = document.getElementById('sections');
  try {
    const config = await fetchJson('data/sections.json');
    let index = { issues: [] };
    try {
      index = await fetchJson('data/issues/index.json');
    } catch {
      index = { issues: [] };
    }
    const today = taipeiDateString(new Date());
    const entry = pickIssue(index.issues, today);
    let issue = null;
    if (entry?.path) {
      try {
        issue = await fetchJson(entry.path);
      } catch {
        issue = null;
      }
    }
    const model = buildPaper({ config, issue, now: new Date() });
    if (dateline) dateline.textContent = model.dateline;
    if (nav) nav.innerHTML = renderNav(model);
    if (sections) {
      sections.innerHTML = renderSections(model);
      bindPaper(sections);
    }
  } catch (error) {
    if (sections) sections.innerHTML = '<p class="empty">報紙載入失敗。</p>';
    console.error(error);
  }
}

main();
