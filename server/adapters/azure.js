import { mean, round, coverageOf, toDate } from './util.js';

/**
 * Azure operational report (PDF) -> metrics 11, 12, 13.
 *
 * The monitor export renders as one line per service/metric/week, so we pull structured
 * records straight out of the extracted text rather than trying to rebuild a table.
 */
const ROW_RE =
  /^(\S+)\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+Week\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(Healthy|Degraded|Breach)\s+(.+?)$/;

const METRIC_MAP = [
  { match: /availability/i, metric: 'AZ_UPTIME' },
  { match: /batch/i, metric: 'AZ_BATCH' },
  { match: /refresh/i, metric: 'AZ_REFRESH' },
];

export function adaptAzure(doc) {
  const records = [];
  for (const line of doc.lines) {
    const m = line.match(ROW_RE);
    if (!m) continue;
    records.push({
      service: m[1],
      metricLabel: m[2].trim(),
      date: m[3],
      window: `Week ${m[4]}`,
      value: Number(m[5]),
      threshold: Number(m[6]),
      status: m[7],
      region: m[8].trim(),
    });
  }
  if (!records.length) return { metrics: {}, error: 'No Azure metric rows recognised in the report' };

  const metrics = {};
  for (const def of METRIC_MAP) {
    const vals = records.filter((r) => def.match.test(r.metricLabel)).map((r) => r.value);
    if (vals.length) metrics[def.metric] = { value: round(mean(vals), 3), sampleSize: vals.length };
  }

  const breaches = records.filter((r) => r.status === 'Breach');

  return {
    metrics,
    coverage: coverageOf(records.map((r) => toDate(r.date))),
    stats: {
      records: records.length,
      services: new Set(records.map((r) => r.service)).size,
      breachRows: breaches.length,
      worstService: breaches.length
        ? breaches.reduce((a, b) => (b.value < a.value ? b : a)).service
        : null,
    },
  };
}
