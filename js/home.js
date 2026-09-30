import { buildPaper, eventIdsFromIssue, previousIssueEntry } from './paper.js';
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
  const frontUpdated = document.getElementById('front-updated');
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
    const previous = previousIssueEntry(index.issues, today);
    let previousEventIds = Array.isArray(previous?.internationalEventIds)
      ? previous.internationalEventIds.filter((id) => typeof id === 'string' && id)
      : [];
    if (previousEventIds.length === 0 && previous?.path && !Array.isArray(previous?.internationalEventIds)) {
      try {
        previousEventIds = eventIdsFromIssue(await fetchJson(previous.path));
      } catch {
        previousEventIds = [];
      }
    }
    let issue = null;
    if (entry?.path) {
      try {
        issue = await fetchJson(entry.path);
      } catch {
        issue = null;
      }
    }
    let international = { events: [] };
    try {
      international = await fetchJson('data/international.json');
    } catch {
      international = { events: [] };
    }
    const model = buildPaper({
      config,
      international,
      issue,
      now: new Date(),
      previousEventIds,
    });
    if (dateline) dateline.textContent = model.dateline;
    if (frontUpdated) frontUpdated.textContent = model.frontUpdated;
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
