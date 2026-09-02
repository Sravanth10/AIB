import { locateGrid, col, toNum, toDate, mean, round, coverageOf } from './util.js';

/**
 * BaNCS workflow extract -> metrics 1-5.
 * Per-process mean TAT, plus STP/data-entry accuracy from the Status column.
 */
const PROCESS_TO_METRIC = [
  { match: 'new business', metric: 'BANCS_NB_TAT' },
  { match: 'underwriting', metric: 'BANCS_UW_TAT' },
  { match: 'claim', metric: 'BANCS_CLAIMS_TAT' },
  { match: 'endorsement', metric: 'BANCS_ENDORSE_TAT' },
];

export function adaptBancs(doc) {
  const grid = locateGrid(doc, ['policy number', 'process type']);
  if (!grid) return { metrics: {}, error: 'Could not locate the policy workflow grid' };

  const cProcess = col(grid.headers, 'process type');
  const cTat = col(grid.headers, 'tat');
  const cStatus = col(grid.headers, 'status');
  const cReceived = col(grid.headers, 'received date');
  const cCompleted = col(grid.headers, 'completed date');

  const buckets = new Map();
  const dates = [];
  let total = 0;
  let rework = 0;

  for (const row of grid.rows) {
    const process = String(row[cProcess] ?? '').toLowerCase();
    const tat = toNum(row[cTat]);
    if (!process) continue;
    total++;

    if (cStatus >= 0 && /rework/i.test(String(row[cStatus] ?? ''))) rework++;
    if (cReceived >= 0) dates.push(toDate(row[cReceived]));
    if (cCompleted >= 0) dates.push(toDate(row[cCompleted]));

    const hit = PROCESS_TO_METRIC.find((p) => process.includes(p.match));
    if (hit && tat != null) {
      if (!buckets.has(hit.metric)) buckets.set(hit.metric, []);
      buckets.get(hit.metric).push(tat);
    }
  }

  const metrics = {};
  for (const [metric, values] of buckets) {
    metrics[metric] = { value: round(mean(values), 2), sampleSize: values.length };
  }
  if (total > 0) {
    metrics.BANCS_STP_ACC = { value: round(((total - rework) / total) * 100, 2), sampleSize: total };
  }

  return {
    metrics,
    coverage: coverageOf(dates),
    stats: { records: total, reworkRecords: rework, processTypes: buckets.size },
  };
}
