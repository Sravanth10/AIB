import { locateGrid, col, toNum, toDate, mean, sum, round, coverageOf } from './util.js';

/**
 * AWS Connect queue export -> metrics 6, 7, 9, 10.
 *
 * ASA and AHT are volume weighted (a 40-call queue must not swing the month as hard as a
 * 400-call one), abandonment is derived from Offered vs Answered so it reconciles with the
 * raw columns, and QA is an unweighted mean of the daily queue scores.
 *
 * Metric 8 (First Call Resolution) is intentionally absent - this source carries no FCR
 * column, and inventing one would defeat the point of the data-quality view.
 */
export function adaptAwsConnect(doc) {
  const grid = locateGrid(doc, ['queue name', 'calls offered']);
  if (!grid) return { metrics: {}, error: 'Could not locate the queue performance grid' };

  const cDate = col(grid.headers, 'date');
  const cOffered = col(grid.headers, 'calls offered');
  const cAnswered = col(grid.headers, 'calls answered');
  const cAsa = col(grid.headers, 'avg speed to answer', 'speed to answer');
  const cAht = col(grid.headers, 'avg handle time', 'handle time');
  const cQa = col(grid.headers, 'qa score');

  const rows = [];
  const dates = [];
  for (const row of grid.rows) {
    const offered = toNum(row[cOffered]);
    if (offered == null || offered <= 0) continue;
    rows.push({
      queue: String(row[0] ?? ''),
      offered,
      answered: toNum(row[cAnswered]) ?? 0,
      asa: toNum(row[cAsa]),
      aht: toNum(row[cAht]),
      qa: toNum(row[cQa]),
    });
    if (cDate >= 0) dates.push(toDate(row[cDate]));
  }
  if (!rows.length) return { metrics: {}, error: 'No queue rows found' };

  const totalOffered = sum(rows.map((r) => r.offered));
  const totalAnswered = sum(rows.map((r) => r.answered));

  const weighted = (valueKey, weightKey) => {
    const usable = rows.filter((r) => r[valueKey] != null && r[weightKey] > 0);
    if (!usable.length) return null;
    const w = sum(usable.map((r) => r[weightKey]));
    return sum(usable.map((r) => r[valueKey] * r[weightKey])) / w;
  };

  const metrics = {};
  metrics.AWS_ABANDON = { value: round(((totalOffered - totalAnswered) / totalOffered) * 100, 2), sampleSize: rows.length };

  const asa = weighted('asa', 'offered');
  if (asa != null) metrics.AWS_ASA = { value: round(asa, 2), sampleSize: rows.length };

  const aht = weighted('aht', 'answered');
  if (aht != null) metrics.AWS_AHT = { value: round(aht, 2), sampleSize: rows.length };

  const qaVals = rows.map((r) => r.qa).filter((v) => v != null);
  if (qaVals.length) metrics.AWS_QA = { value: round(mean(qaVals), 2), sampleSize: qaVals.length };

  return {
    metrics,
    coverage: coverageOf(dates),
    stats: {
      records: rows.length,
      callsOffered: totalOffered,
      callsAnswered: totalAnswered,
      queues: new Set(rows.map((r) => r.queue)).size,
      fcrColumnPresent: col(grid.headers, 'first call resolution', 'fcr') >= 0,
    },
  };
}
