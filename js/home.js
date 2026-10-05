import {
  issueInstant,
  monthOf,
  parseIssueDate,
  renderArchive,
  selectIssue,
  shiftMonth,
} from './archive.js';
import { escapeHtml } from './html.js';
import { buildPaper } from './paper.js';
import { bindPaper, renderNav, renderSections } from './render.js';
import { formatDateline } from './time.js';

async function fetchJson(file) {
  const response = await fetch(file, { cache: 'no-store' });
  if (!response.ok) throw new Error(file);
  return response.json();
}

function bindScrollProgress() {
  const bar = document.getElementById('scroll-progress');
  if (!bar) return;
  const update = () => {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const progress = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
    bar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

function requestedDate() {
  return parseIssueDate(new URLSearchParams(location.search).get('date') || '');
}

async function main() {
  const dateline = document.getElementById('dateline');
  const nav = document.getElementById('section-nav');
  const sections = document.getElementById('sections');
  const archive = document.getElementById('archive');
  const cache = new Map();
  let config = { sections: [] };
  let issues = [];
  let viewMonth = null;
  let calendarOpen = false;
  let paintToken = 0;
  let shownDate = '';

  try {
    config = await fetchJson('data/sections.json');
  } catch (error) {
    if (sections) sections.innerHTML = '<p class="empty">報紙載入失敗。</p>';
    console.error(error);
    return;
  }
  try {
    const index = await fetchJson('data/issues/index.json');
    issues = Array.isArray(index.issues) ? index.issues : [];
  } catch {
    issues = [];
  }

  async function loadIssue(entry) {
    if (cache.has(entry.date)) return cache.get(entry.date);
    const issue = await fetchJson(entry.path);
    cache.set(entry.date, issue);
    return issue;
  }

  function openDate(date) {
    const url = new URL(location.href);
    url.searchParams.set('date', date);
    history.pushState({}, '', `${url.pathname}${url.search}`);
    viewMonth = monthOf(date);
    paint();
  }

  function closeCalendar({ focusToggle = false } = {}) {
    if (!calendarOpen) return;
    calendarOpen = false;
    paintCalendar();
    if (focusToggle) archive?.querySelector('.archive-toggle')?.focus();
  }

  if (archive) {
    archive.addEventListener('click', (event) => {
      event.stopPropagation();
      const toggle = event.target.closest('.archive-toggle');
      if (toggle) {
        calendarOpen = !calendarOpen;
        paintCalendar();
        return;
      }
      const shift = event.target.closest('[data-shift]');
      if (shift && viewMonth) {
        viewMonth = shiftMonth(viewMonth.year, viewMonth.month, Number(shift.dataset.shift));
        paintCalendar();
        return;
      }
      const jump = event.target.closest('[data-date]');
      if (!jump || jump.disabled) return;
      const date = parseIssueDate(jump.dataset.date);
      if (!date) return;
      calendarOpen = false;
      openDate(date);
    });
  }

  document.addEventListener('click', (event) => {
    if (!calendarOpen || archive?.contains(event.target)) return;
    closeCalendar();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeCalendar({ focusToggle: true });
  });

  function paintCalendar() {
    const selection = selectIssue({ issues, requestedDate: requestedDate() });
    const anchor = selection.entry?.date || selection.requested;
    if (!viewMonth && anchor) viewMonth = monthOf(anchor);
    if (archive && viewMonth) {
      const active = archive.contains(document.activeElement) ? document.activeElement : null;
      const activeShift = active?.dataset?.shift || '';
      const activeToggle = Boolean(active?.closest?.('.archive-toggle'));
      archive.innerHTML = renderArchive({
        issues,
        selectedDate: selection.entry?.date || '',
        year: viewMonth.year,
        month: viewMonth.month,
        open: calendarOpen,
      });
      if (activeToggle) archive.querySelector('.archive-toggle')?.focus();
      if (activeShift) archive.querySelector(`[data-shift="${activeShift}"]`)?.focus();
    }
    return selection;
  }

  async function paint() {
    const token = paintToken + 1;
    paintToken = token;
    const selection = paintCalendar();
    if (!selection.entry) {
      if (dateline) {
        dateline.textContent = selection.requested
          ? formatDateline(issueInstant(selection.requested), null)
          : '尚無出刊';
      }
      if (nav) nav.innerHTML = '';
      if (sections) {
        const when = selection.requested ? `${escapeHtml(selection.requested)} ` : '';
        sections.innerHTML = `<p class="empty">${when}沒有出刊。</p>`;
      }
      shownDate = '';
      return;
    }
    try {
      const issue = await loadIssue(selection.entry);
      if (token !== paintToken) return;
      const model = buildPaper({ config, issue, now: new Date() });
      if (dateline) dateline.textContent = model.dateline;
      if (nav) nav.innerHTML = renderNav(model);
      if (sections) {
        sections.innerHTML = renderSections(model);
        bindPaper(sections);
      }
      if (shownDate && shownDate !== selection.entry.date) window.scrollTo(0, 0);
      shownDate = selection.entry.date;
    } catch (error) {
      if (token !== paintToken) return;
      if (sections) sections.innerHTML = '<p class="empty">報紙載入失敗。</p>';
      console.error(error);
    }
  }

  window.addEventListener('popstate', () => {
    const date = requestedDate();
    if (date) viewMonth = monthOf(date);
    paint();
  });
  await paint();
  bindScrollProgress();
}

main();
