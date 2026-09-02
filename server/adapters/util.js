import { normalise, findHeaderRow } from '../parse.js';

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Locate the sheet + header row holding the given anchor columns. */
export function locateGrid(doc, anchors) {
  for (const sheet of doc.sheets) {
    const idx = findHeaderRow(sheet.rows);
    if (idx < 0) continue;
    const headers = sheet.rows[idx].map(normalise);
    if (anchors.every((a) => headers.some((h) => h.includes(normalise(a))))) {
      return {
        sheet,
        headerIndex: idx,
        headers,
        rows: sheet.rows.slice(idx + 1).filter((r) => r.some((c) => String(c).trim() !== '')),
      };
    }
  }
  return null;
}

/** First column whose header contains any of the given names. */
export function col(headers, ...names) {
  for (const n of names) {
    const t = normalise(n);
    const i = headers.findIndex((h) => h.includes(t));
    if (i >= 0) return i;
  }
  return -1;
}

export function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Lenient date parsing. The manual tracker mixes real date cells with hand-typed strings
 * in the same column, so anything strict throws away a third of the rows.
 */
export function toDate(v) {
  if (!v) return null;
  const s = String(v).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/yyyy
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));

  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/); // 01-Aug-26
  if (m) {
    const mi = MONTH_ABBR.indexOf(m[2].toLowerCase());
    if (mi >= 0) {
      const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return new Date(Date.UTC(yr, mi, +m[1]));
    }
  }
  return null;
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const round = (v, dp = 2) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

/** Coverage window of a set of dates - drives the stale-data check. */
export function coverageOf(dates) {
  const valid = dates.filter(Boolean).sort((a, b) => a - b);
  if (!valid.length) return null;
  return { start: valid[0].toISOString().slice(0, 10), end: valid[valid.length - 1].toISOString().slice(0, 10) };
}
