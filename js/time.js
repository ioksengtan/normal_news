const WEEK = {
  Sun: '星期日',
  Mon: '星期一',
  Tue: '星期二',
  Wed: '星期三',
  Thu: '星期四',
  Fri: '星期五',
  Sat: '星期六',
};

export function taipeiParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEK[parts.weekday] || parts.weekday,
  };
}

export function taipeiDateString(date) {
  const parts = taipeiParts(date);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function formatDateline(date, issueNumber) {
  const parts = taipeiParts(date);
  const issue = Number.isInteger(issueNumber) ? `第 ${issueNumber} 期` : '第 — 期';
  return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日\u3000${parts.weekday}\u3000${issue}`;
}

export function formatHM(date) {
  const parts = taipeiParts(date);
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  return `${hour}:${minute}`;
}

function zonedDate(date, hour) {
  const parts = taipeiParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 8, 0, 0, 0));
}

export function taipeiMidnight(date) {
  return zonedDate(date, 0);
}

export function publicationStart(date, hour = 7) {
  const start = zonedDate(date, hour);
  if (date.getTime() < start.getTime()) {
    return new Date(start.getTime() - 24 * 60 * 60 * 1000);
  }
  return start;
}
