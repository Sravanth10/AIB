import { SCENARIO, AZURE_SERVICES } from '../scenario.js';
import { rng, fitMean, randFloat, round, sum } from '../lib/num.js';
import { weeksOf, fmtISO, dayOfMonth, daysInMonth, monthLabel, addDays } from '../lib/dates.js';
import { createDoc, finish, table, rule, keyValueBlock, MARGIN } from '../lib/pdf.js';

/**
 * Azure operational report (PDF), laid out like an Azure Monitor workbook export.
 * Structure: Service Name, Metric, Date, Value, Threshold, Status, Region.
 *
 * Distinguishing cues for the classifier: monitor-style header block (subscription ID,
 * resource group, workbook name), kebab-case service names, an explicit Threshold column
 * and a Healthy/Degraded/Breach status vocabulary.
 *
 * For 2026-08 the report is cut mid-month (scenario.azureCoverage = 'partial'), which is
 * what produces the "stale data" flag in the consolidated view.
 */

const METRIC_DEFS = [
  { key: 'availability', label: 'Availability %', metricId: 'AZ_UPTIME', threshold: 99.5, tolerance: 0.15, dp: 2 },
  { key: 'batch', label: 'Batch Completion Rate %', metricId: 'AZ_BATCH', threshold: 99, tolerance: 0.5, dp: 2 },
  { key: 'refresh', label: 'Refresh On-Time %', metricId: 'AZ_REFRESH', threshold: 95, tolerance: 2, dp: 2 },
];

function statusFor(value, def) {
  if (value >= def.threshold) return 'Healthy';
  if (value >= def.threshold - def.tolerance) return 'Degraded';
  return 'Breach';
}

const STATUS_COLOUR = { Healthy: '#1a7f4b', Degraded: '#a86b00', Breach: '#b3261e' };

export async function generateAzure(monthKey, outPath) {
  const sc = SCENARIO[monthKey];
  const r = rng(sc.seed + 33);
  const dim = daysInMonth(monthKey);

  let weeks = weeksOf(monthKey);
  let cutoffDay = dim;
  if (sc.azureCoverage === 'partial') {
    cutoffDay = 24;
    weeks = weeks.filter((w) => w.end.getUTCDate() <= cutoffDay);
  }

  const rows = [];
  for (const def of METRIC_DEFS) {
    const services = AZURE_SERVICES[def.key];
    const target = sc.values[def.metricId];
    const n = services.length * weeks.length;

    // Generate the *shortfall* rather than the value, so nothing can round above 100%.
    const shortfallTarget = 100 - target;
    const seed = Array.from({ length: n }, () => randFloat(r, shortfallTarget * 0.25, shortfallTarget * 2.1));
    const shortfalls = fitMean(seed, shortfallTarget, def.dp, 0.01);

    let i = 0;
    for (const w of weeks) {
      for (const svc of services) {
        const value = round(100 - shortfalls[i++], def.dp);
        rows.push({
          service: svc.service,
          metric: def.label,
          date: fmtISO(w.end),
          window: w.label,
          value: value.toFixed(def.dp),
          threshold: def.threshold.toFixed(2),
          status: statusFor(value, def),
          region: svc.region,
          _value: value,
        });
      }
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.metric.localeCompare(b.metric));

  const { doc, done } = createDoc(outPath);
  const lastDate = weeks[weeks.length - 1].end;

  // --- Monitor-style header -------------------------------------------------
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f2b46').text('Microsoft Azure  |  Operational Service Report');
  doc.font('Helvetica').fontSize(9).fillColor('#5b6b7d').text('Azure Monitor workbook export - Service Health & Platform SLA');
  doc.moveDown(0.6);
  rule(doc);

  keyValueBlock(doc, [
    ['Subscription', 'aibl-prod-01'],
    ['Subscription ID', 'b4f7c2ad-9e10-4c33-8a52-1d6f0e73a9cc'],
    ['Resource Group', 'rg-aibl-platform-neu'],
    ['Workbook', 'SLA-Operational-Monthly'],
    ['Reporting Period', monthLabel(monthKey)],
    ['Period Start', fmtISO(dayOfMonth(monthKey, 1))],
    ['Data Through', fmtISO(lastDate)],
    ['Generated', `${fmtISO(addDays(lastDate, 1))} 06:15 UTC`],
    ['Aggregation', 'Weekly rollup (mean)'],
    ['Regions', 'North Europe, West Europe'],
  ]);

  if (sc.azureCoverage === 'partial') {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#a86b00')
      .text(`Note: export cut at ${fmtISO(lastDate)} - remaining weeks of the period pending platform data reconciliation.`, MARGIN, doc.y);
    doc.moveDown(0.6);
    doc.fillColor('#22303f');
  }

  rule(doc);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f2b46').text('Metric detail');
  doc.moveDown(0.4);

  table(doc, {
    // Widths must total <= 515pt (A4 width less the 40pt margins) or cells silently overflow.
    columns: [
      { key: 'service', label: 'Service Name', width: 102 },
      { key: 'metric', label: 'Metric', width: 112 },
      { key: 'date', label: 'Date', width: 56 },
      { key: 'window', label: 'Window', width: 42 },
      { key: 'value', label: 'Value', width: 42, align: 'right' },
      { key: 'threshold', label: 'Threshold', width: 48, align: 'right' },
      { key: 'status', label: 'Status', width: 48, color: (v) => STATUS_COLOUR[v] },
      { key: 'region', label: 'Region', width: 65 },
    ],
    rows,
  });

  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(7).fillColor('#7a8899')
    .text(`${rows.length} metric records | Platform SLA thresholds per AIB Life master services agreement Schedule 4.`, MARGIN, doc.y);

  await finish(doc, done);

  const rollup = {};
  for (const def of METRIC_DEFS) {
    const vals = rows.filter((x) => x.metric === def.label).map((x) => x._value);
    rollup[def.metricId] = round(sum(vals) / vals.length, 3);
  }
  return { rows: rows.length, weeks: weeks.length, dataThrough: fmtISO(lastDate), rollup };
}
