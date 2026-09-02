import fs from 'node:fs';
import { SCENARIO, QUEUES } from '../scenario.js';
import { rng, fitMean, fitWeightedMean, randFloat, randInt, round, sum } from '../lib/num.js';
import { businessDays, fmtISO, monthLabel, dayOfMonth, daysInMonth } from '../lib/dates.js';

/**
 * AWS Connect contact centre historical metrics export (CSV).
 * Structure: a quoted metadata preamble, then Queue Name / Date / Calls Offered / Calls
 * Answered / Avg Speed to Answer / Abandonment Rate / Avg Handle Time / QA Score.
 *
 * NOTE: there is deliberately no First Call Resolution column. FCR is one of the 15 SLAs,
 * so it surfaces in the consolidated view as a genuine "no source data received" flag
 * rather than a fabricated number. See config/sla-metrics.json -> AWS_FCR.
 */
export function generateAwsConnect(monthKey, outPath) {
  const sc = SCENARIO[monthKey];
  const r = rng(sc.seed + 22);
  const days = businessDays(monthKey);

  const rows = [];
  for (const day of days) {
    // Mondays and month-end run hot; mid-week is calmer.
    const dow = day.getUTCDay();
    const load = dow === 1 ? 1.28 : dow === 5 ? 0.86 : 1.0;
    for (const q of QUEUES) {
      const offered = Math.round(1050 * q.share * load * randFloat(r, 0.82, 1.18));
      rows.push({ queue: q.name, date: day, offered });
    }
  }

  const offered = rows.map((x) => x.offered);
  const totalOffered = sum(offered);

  // --- Abandonment: derived from Offered vs Answered so the CSV reconciles with itself ---
  const targetAband = sc.values.AWS_ABANDON;
  const perRowRate = rows.map(() => randFloat(r, targetAband * 0.55, targetAband * 1.45));
  const abandoned = rows.map((x, i) => Math.max(0, Math.round((x.offered * perRowRate[i]) / 100)));
  const wantAbandoned = Math.round((totalOffered * targetAband) / 100);

  // Spread the rounding correction across many rows - loading it all onto one row clips
  // against that row's own call volume and lets the monthly rate drift off target.
  let diff = wantAbandoned - sum(abandoned);
  let guard = 0;
  while (diff !== 0 && guard++ < rows.length * 500) {
    const i = randInt(r, 0, rows.length - 1);
    if (diff > 0 && abandoned[i] < rows[i].offered * 0.25) {
      abandoned[i]++;
      diff--;
    } else if (diff < 0 && abandoned[i] > 1) {
      abandoned[i]--;
      diff++;
    }
  }

  rows.forEach((x, i) => {
    x.abandoned = abandoned[i];
    x.answered = x.offered - abandoned[i];
  });

  // --- ASA and AHT: volume weighted, so the monthly roll-up is the weighted mean ---
  const asaSeed = rows.map(() => randFloat(r, sc.values.AWS_ASA * 0.5, sc.values.AWS_ASA * 1.7));
  const asa = fitWeightedMean(asaSeed, offered, sc.values.AWS_ASA, 1, 3);

  const answered = rows.map((x) => x.answered);
  const ahtSeed = rows.map(() => randFloat(r, sc.values.AWS_AHT * 0.78, sc.values.AWS_AHT * 1.25));
  const aht = fitWeightedMean(ahtSeed, answered, sc.values.AWS_AHT, 0, 60);

  // --- QA score: a simple unweighted mean of the daily queue scores ---
  const qaSeed = rows.map(() => randFloat(r, sc.values.AWS_QA - 6, sc.values.AWS_QA + 6));
  const qa = fitMean(qaSeed, sc.values.AWS_QA, 1, 60);

  rows.forEach((x, i) => {
    x.asa = asa[i];
    x.aht = Math.round(aht[i]);
    x.qa = qa[i];
    x.abandonPct = round((x.abandoned / x.offered) * 100, 1);
  });

  rows.sort((a, b) => a.date - b.date || a.queue.localeCompare(b.queue));

  const dim = daysInMonth(monthKey);
  const preamble = [
    ['Amazon Connect - Historical Metrics Report'],
    ['Instance', 'aibl-contact-centre-prod'],
    ['Instance ARN', 'arn:aws:connect:eu-west-1:community:instance/7c41e8b2-aibl-prod'],
    ['Report Name', 'Queue Daily Performance'],
    ['Time Zone', 'Europe/Dublin'],
    ['Interval', 'Daily'],
    ['Start Date', fmtISO(dayOfMonth(monthKey, 1))],
    ['End Date', fmtISO(dayOfMonth(monthKey, dim))],
    ['Reporting Period', monthLabel(monthKey)],
    [],
  ];

  const header = [
    'Queue Name',
    'Date',
    'Calls Offered',
    'Calls Answered',
    'Calls Abandoned',
    'Avg Speed to Answer (s)',
    'Abandonment Rate (%)',
    'Avg Handle Time (s)',
    'QA Score (%)',
  ];

  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [
    ...preamble.map((p) => p.map(esc).join(',')),
    header.map(esc).join(','),
    ...rows.map((x) =>
      [x.queue, fmtISO(x.date), x.offered, x.answered, x.abandoned, x.asa.toFixed(1), x.abandonPct.toFixed(1), x.aht, x.qa.toFixed(1)]
        .map(esc)
        .join(','),
    ),
  ];

  fs.writeFileSync(outPath, lines.join('\r\n') + '\r\n', 'utf8');

  return {
    rows: rows.length,
    abandonment: round((sum(rows.map((x) => x.abandoned)) / totalOffered) * 100, 2),
    asa: round(sum(rows.map((x) => x.asa * x.offered)) / totalOffered, 2),
    aht: round(sum(rows.map((x) => x.aht * x.answered)) / sum(answered), 2),
    qa: round(sum(rows.map((x) => x.qa)) / rows.length, 2),
  };
}
