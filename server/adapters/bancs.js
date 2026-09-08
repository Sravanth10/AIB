import { locateGrid, col, toNum, toDate, mean, round, coverageOf, breakdown } from './util.js';

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

  const cBranch = col(grid.headers, 'branch');
  const cSubType = col(grid.headers, 'process sub type', 'sub type');

  const buckets = new Map();
  const records = [];
  const dates = [];
  let total = 0;
  let rework = 0;

  for (const row of grid.rows) {
    const process = String(row[cProcess] ?? '').toLowerCase();
    const tat = toNum(row[cTat]);
    if (!process) continue;
    total++;

    const isRework = cStatus >= 0 && /rework/i.test(String(row[cStatus] ?? ''));
    if (isRework) rework++;
    if (cReceived >= 0) dates.push(toDate(row[cReceived]));
    if (cCompleted >= 0) dates.push(toDate(row[cCompleted]));

    const hit = PROCESS_TO_METRIC.find((p) => process.includes(p.match));
    if (hit && tat != null) {
      if (!buckets.has(hit.metric)) buckets.set(hit.metric, []);
      buckets.get(hit.metric).push(tat);
    }

    records.push({
      metric: hit?.metric ?? null,
      tat,
      isRework,
      branch: cBranch >= 0 ? row[cBranch] : null,
      subType: cSubType >= 0 ? row[cSubType] : null,
    });
  }

  const metrics = {};
  for (const [metric, values] of buckets) {
    metrics[metric] = { value: round(mean(values), 2), sampleSize: values.length };
  }
  if (total > 0) {
    metrics.BANCS_STP_ACC = { value: round(((total - rework) / total) * 100, 2), sampleSize: total };
  }

  // Where each turnaround metric actually sits, by branch and by process sub type.
  const breakdowns = [];
  for (const metric of buckets.keys()) {
    const forMetric = records.filter((x) => x.metric === metric && x.tat != null);
    breakdowns.push(
      ...breakdown(forMetric, { metricId: metric, dimension: 'branch', keyFn: (x) => x.branch, valueFn: (x) => x.tat }),
      ...breakdown(forMetric, { metricId: metric, dimension: 'process sub type', keyFn: (x) => x.subType, valueFn: (x) => x.tat }),
    );
  }
  // Accuracy is a rate, so the per-branch figure is the share completed without rework.
  breakdowns.push(
    ...breakdown(records, {
      metricId: 'BANCS_STP_ACC',
      dimension: 'branch',
      keyFn: (x) => x.branch,
      valueFn: (x) => (x.isRework ? 0 : 1),
      aggregate: 'rate',
    }),
  );

  return {
    metrics,
    breakdowns,
    coverage: coverageOf(dates),
    stats: { records: total, reworkRecords: rework, processTypes: buckets.size },
  };
}
