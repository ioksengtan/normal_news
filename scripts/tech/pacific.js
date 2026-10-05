const ZONE = 'America/Los_Angeles';

function pad(value) {
  return String(value).padStart(2, '0');
}

function zonedParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  const ymd = { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
  if (hour === 24) {
    hour = 0;
    const next = addDays(ymd, 1);
    ymd.year = next.year;
    ymd.month = next.month;
    ymd.day = next.day;
  }
  return { ...ymd, hour, minute: Number(parts.minute), second: Number(parts.second), offset: parts.timeZoneName };
}

function offsetMinutes(label) {
  const match = String(label || '').match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function formatYmd(ymd) {
  return `${ymd.year}-${pad(ymd.month)}-${pad(ymd.day)}`;
}

function addDays(ymd, delta) {
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  date.setUTCDate(date.getUTCDate() + delta);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function zonedMidnight(ymd) {
  let utc = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 8, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(utc));
    const got = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const want = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0);
    if (got === want) return new Date(utc);
    utc += want - got;
  }
  return new Date(utc);
}

function formatPacific(date) {
  const parts = zonedParts(date);
  const minutes = offsetMinutes(parts.offset);
  if (minutes == null) throw new Error(`無法讀取太平洋時區偏移（${parts.offset || '空'}）`);
  return `${formatYmd(parts)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${formatOffset(minutes)}`;
}

export function productHuntWindow(issueDateOrInstant) {
  const instant = issueDateOrInstant instanceof Date
    ? issueDateOrInstant
    : new Date(`${issueDateOrInstant}T07:00:00+08:00`);
  if (Number.isNaN(instant.getTime())) throw new Error('日期無效');
  const finished = addDays(zonedParts(instant), -1);
  const start = zonedMidnight(finished);
  const end = zonedMidnight(addDays(finished, 1));
  return {
    pacificDate: formatYmd(finished),
    postedAfter: formatPacific(start),
    postedBefore: formatPacific(end),
  };
}
