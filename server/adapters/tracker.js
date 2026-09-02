import { locateGrid, col, toNum, toDate, mean, round, coverageOf } from './util.js';

/**
 * Manual complaints tracker -> metric 14.
 *
 * This adapter also does most of the data-quality harvesting, because this is the file where
 * defects actually live: hand-typed dates, cases left open, references reused, and a typed
 * TOTAL footer that must not be counted as a case.
 */
const FOOTER_RE = /^(total|sub\s*-?\s*total|avg|average|count)\b/i;

export function adaptTracker(doc) {
  const grid = locateGrid(doc, ['days to resolve']);
  if (!grid) return { metrics: {}, error: 'Could not locate the complaints grid' };

  const cRef = col(grid.headers, 'ref');
  const cReceived = col(grid.headers, 'complaint received', 'received');
  const cClosed = col(grid.headers, 'complaint closed', 'closed');
  const cDays = col(grid.headers, 'days to resolve');
  const cStatus = col(grid.headers, 'status');
  const cCategory = col(grid.headers, 'category');

  const cases = [];
  const dates = [];
  let looseDates = 0;
  let unparseableDates = 0;

  for (const row of grid.rows) {
    const ref = String(row[cRef] ?? '').trim();
    if (!ref || FOOTER_RE.test(ref)) continue;

    const rawReceived = row[cReceived];
    const received = toDate(rawReceived);
    if (rawReceived && !/^\d{4}-\d{2}-\d{2}/.test(String(rawReceived).trim())) looseDates++;
    if (rawReceived && !received) unparseableDates++;

    let days = toNum(row[cDays]);
    const closed = toDate(row[cClosed]);
    // Fall back to deriving the duration when the column was left blank but both dates exist.
    if (days == null && received && closed) days = Math.round((closed - received) / 86400000);

    cases.push({
      ref,
      received,
      closed,
      days,
      status: String(row[cStatus] ?? '').trim(),
      category: String(row[cCategory] ?? '').trim(),
    });
    if (received) dates.push(received);
    if (closed) dates.push(closed);
  }

  const closedCases = cases.filter((c) => c.days != null && c.closed);
  const openCases = cases.filter((c) => !c.closed);

  const seen = new Set();
  const duplicateRefs = [];
  for (const c of cases) {
    if (seen.has(c.ref)) duplicateRefs.push(c.ref);
    seen.add(c.ref);
  }

  const metrics = {};
  if (closedCases.length) {
    metrics.MAN_COMPLAINT_TAT = { value: round(mean(closedCases.map((c) => c.days)), 2), sampleSize: closedCases.length };
  }

  return {
    metrics,
    coverage: coverageOf(dates),
    stats: {
      records: cases.length,
      closed: closedCases.length,
      open: openCases.length,
      duplicateRefs: [...new Set(duplicateRefs)],
      looseDates,
      unparseableDates,
      topCategory: mostCommon(closedCases.map((c) => c.category)),
    },
  };
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values.filter(Boolean)) counts.set(v, (counts.get(v) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : null;
}
