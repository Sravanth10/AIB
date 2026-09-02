// All dates are handled as UTC to keep generated files byte-stable across machines.

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parseMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m - 1 };
}

export function monthLabel(key, style = 'full') {
  const { year, month } = parseMonth(key);
  return `${style === 'full' ? MONTH_FULL[month] : MONTH_ABBR[month]} ${year}`;
}

/** "Aug2026" - used in filenames. */
export function monthFileTag(key) {
  const { year, month } = parseMonth(key);
  return `${MONTH_ABBR[month]}${year}`;
}

export function daysInMonth(key) {
  const { year, month } = parseMonth(key);
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function dayOfMonth(key, day) {
  const { year, month } = parseMonth(key);
  return new Date(Date.UTC(year, month, day));
}

export function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}

export function isWeekend(date) {
  const d = date.getUTCDay();
  return d === 0 || d === 6;
}

/** Every Mon-Fri date in the month, as Date objects. */
export function businessDays(key) {
  const out = [];
  for (let d = 1; d <= daysInMonth(key); d++) {
    const dt = dayOfMonth(key, d);
    if (!isWeekend(dt)) out.push(dt);
  }
  return out;
}

/**
 * Reporting weeks within the month: [{ label, start, end }].
 * Weeks are clipped to the month boundaries, so week 1 and the last week are often short.
 */
export function weeksOf(key) {
  const total = daysInMonth(key);
  const weeks = [];
  let start = 1;
  let n = 1;
  while (start <= total) {
    const end = Math.min(start + 6, total);
    weeks.push({ label: `Week ${n}`, index: n, start: dayOfMonth(key, start), end: dayOfMonth(key, end) });
    start = end + 1;
    n++;
  }
  return weeks;
}

export const fmtISO = (d) => d.toISOString().slice(0, 10);

/** "14/08/2026" */
export const fmtUK = (d) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

/** "14-Aug-26" - the messy format the manual tracker mixes in. */
export const fmtLoose = (d) =>
  `${String(d.getUTCDate()).padStart(2, '0')}-${MONTH_ABBR[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;

/** "Mon 03 Aug 2026" - email header style. */
export function fmtEmail(d) {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${wd}, ${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
