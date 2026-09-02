import { mean, round } from './util.js';

/**
 * Forwarded escalation email thread (PDF) -> metric 15.
 *
 * There is no grid to find here. Each escalation is a single line inside the body of a
 * weekly summary, so the adapter reads the prose and pulls the structured lines out of it.
 */
const ESC_RE =
  /(ESC-\d{4}-\d{4})\s+Raised\s+(\d{1,2}\s+[A-Za-z]{3})\s+Resolved\s+(\d{1,2}\s+[A-Za-z]{3})\s+([\d.]+)\s+days\s+(.+?)\s+Closed/i;

const SUBJECT_RE = /Subject:\s*(.+)$/i;

export function adaptEmailFeed(doc) {
  const items = [];
  const subjects = [];

  for (const line of doc.lines) {
    const m = line.match(ESC_RE);
    if (m) {
      items.push({ ref: m[1], raised: m[2], resolved: m[3], days: Number(m[4]), category: m[5].trim() });
      continue;
    }
    const s = line.match(SUBJECT_RE);
    if (s) subjects.push(s[1].trim());
  }

  if (!items.length) return { metrics: {}, error: 'No escalation lines recognised in the email thread' };

  const metrics = {
    MAN_ESCALATION_TAT: { value: round(mean(items.map((i) => i.days)), 2), sampleSize: items.length },
  };

  const counts = new Map();
  for (const i of items) counts.set(i.category, (counts.get(i.category) || 0) + 1);
  const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    metrics,
    coverage: null, // escalation lines carry day+month only, so no reliable year to anchor to
    stats: {
      records: items.length,
      weeklySummaries: subjects.filter((s) => /week/i.test(s)).length,
      breachedTarget: items.filter((i) => i.days > 2).length,
      topCategory,
    },
  };
}
