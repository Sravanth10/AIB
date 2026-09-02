import ExcelJS from 'exceljs';
import { SCENARIO, COMPLAINT_CATEGORIES, COMPLAINT_OWNERS } from '../scenario.js';
import { rng, randInt, pick, round, sum } from '../lib/num.js';
import { daysInMonth, dayOfMonth, addDays, monthLabel, fmtLoose, fmtUK, MONTH_ABBR, parseMonth } from '../lib/dates.js';

/**
 * Manually maintained complaints tracker (Excel).
 *
 * This is the deliberately scruffy one - it is the file that proves the classifier is
 * reasoning over structure rather than reading a filename. It carries:
 *   - a merged title block, so the header row is not row 1
 *   - mixed date types (real dates AND "14-Aug-26" text strings in the same column)
 *   - Owner / Notes columns that no core system would emit
 *   - blank rows, a hand-typed TOTAL footer, and open items with empty close dates
 *   - one duplicated reference, which the data-quality engine should flag
 *
 * Metric: MAN_COMPLAINT_TAT = mean "Days to Resolve" across CLOSED rows only.
 */

// Notes are picked to match how long the case actually ran - a fifteen-day case annotated
// "resolved at first contact" is the sort of detail someone reads off the screen mid-demo.
const NOTES = {
  fast: ['Resolved at first contact, GW letter issued', 'Closed - no case to answer', 'Duplicate of earlier contact, merged', ''],
  slow: [
    'Chased twice - client on holiday',
    'Redress calculated, payment raised',
    'Escalated to Ops Manager',
    'FSPO referral risk - monitor',
    'Waiting on BaNCS correction',
    '',
  ],
  open: ['Awaiting adviser statement', 'Waiting on BaNCS correction', 'Escalated to Ops Manager', 'Chased twice - client on holiday'],
};

/** Integer values that sum to exactly `want`, kept inside [min, max]. */
function fitIntSum(r, n, want, min, max) {
  const vals = Array.from({ length: n }, () => randInt(r, min, max));
  let diff = want - sum(vals);
  let guard = 0;
  while (diff !== 0 && guard++ < n * 400) {
    const i = randInt(r, 0, n - 1);
    if (diff > 0 && vals[i] < max) {
      vals[i]++;
      diff--;
    } else if (diff < 0 && vals[i] > min) {
      vals[i]--;
      diff++;
    }
  }
  return vals;
}

export async function generateTracker(monthKey, outPath) {
  const sc = SCENARIO[monthKey];
  const r = rng(sc.seed + 44);
  const dim = daysInMonth(monthKey);
  const target = sc.values.MAN_COMPLAINT_TAT;

  // Nudge the closed-case count to one where an integer day-count can hit the target mean exactly.
  let n = sc.volumes.complaints.closed;
  for (let d = 0; d <= 4; d++) {
    const cand = [n - d, n + d].find((c) => Math.abs(target * c - Math.round(target * c)) < 1e-9);
    if (cand) {
      n = cand;
      break;
    }
  }
  const days = fitIntSum(r, n, Math.round(target * n), Math.max(1, Math.round(target * 0.25)), Math.round(target * 2.4));

  const { month } = parseMonth(monthKey);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const received = dayOfMonth(monthKey, randInt(r, 1, dim));
    rows.push({
      ref: `CMP-${MONTH_ABBR[month].toUpperCase()}-${String(101 + i)}`,
      received,
      closed: addDays(received, days[i]),
      days: days[i],
      category: pick(r, COMPLAINT_CATEGORIES),
      owner: pick(r, COMPLAINT_OWNERS),
      status: 'Closed',
      notes: pick(r, days[i] <= 3 ? NOTES.fast : NOTES.slow),
    });
  }
  for (let i = 0; i < sc.volumes.complaints.open; i++) {
    const received = dayOfMonth(monthKey, randInt(r, Math.max(1, dim - 9), dim));
    rows.push({
      ref: `CMP-${MONTH_ABBR[month].toUpperCase()}-${String(101 + n + i)}`,
      received,
      closed: null,
      days: null,
      category: pick(r, COMPLAINT_CATEGORIES),
      owner: pick(r, COMPLAINT_OWNERS),
      status: pick(r, ['Open', 'Open - With Adviser', 'Under Review']),
      notes: pick(r, NOTES.open),
    });
  }

  rows.sort((a, b) => a.received - b.received);
  // Planted data-quality defect: a duplicated reference on an open item.
  if (rows.length > 6) rows[rows.length - 2].ref = rows[3].ref;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'M. Byrne';
  wb.lastModifiedBy = 'S. O’Connell';

  const ws = wb.addWorksheet('Complaints Log');
  ws.columns = [
    { width: 15 },
    { width: 16 },
    { width: 16 },
    { width: 15 },
    { width: 22 },
    { width: 16 },
    { width: 18 },
    { width: 42 },
  ];

  // --- Hand-made title block: header row is NOT row 1 -----------------------
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'AIB Life – Customer Complaints & Resolution Tracker';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F3864' } };
  ws.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 22;

  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = `Reporting month: ${monthLabel(monthKey)}    |    Owner: Operations Governance    |    Last updated: ${fmtUK(dayOfMonth(monthKey, dim))}`;
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF595959' } };

  ws.mergeCells('A3:H3');
  ws.getCell('A3').value = 'Please update daily. Days to Resolve = working assumption, calendar days.';
  ws.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FFA6A6A6' } };

  ws.addRow([]); // row 4 blank

  const headerRow = ws.addRow([
    'Ref',
    'Complaint Received',
    'Complaint Closed',
    'Days to Resolve',
    'Category',
    'Owner',
    'Status',
    'Notes',
  ]);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  headerRow.border = { bottom: { style: 'medium' } };

  rows.forEach((x, i) => {
    // Roughly a third of the dates were typed by hand rather than entered as dates.
    const loose = i % 3 === 1;
    const row = ws.addRow([
      x.ref,
      loose ? fmtLoose(x.received) : x.received,
      x.closed ? (loose ? fmtLoose(x.closed) : x.closed) : '',
      x.days ?? '',
      x.category,
      x.owner,
      x.status,
      x.notes,
    ]);
    if (!loose) {
      row.getCell(2).numFmt = 'dd/mm/yyyy';
      if (x.closed) row.getCell(3).numFmt = 'dd/mm/yyyy';
    }
    if (x.status !== 'Closed') {
      row.getCell(7).font = { color: { argb: 'FFC00000' }, bold: true };
    }
  });

  ws.addRow([]);
  const totalRow = ws.addRow(['TOTAL', '', '', `${rows.filter((x) => x.days != null).length} closed`, '', '', `${rows.filter((x) => x.days == null).length} open`, '']);
  totalRow.font = { bold: true };

  ws.addRow([]);
  ws.addRow(['', '', '', 'Avg days (closed):', { formula: `AVERAGE(D6:D${5 + rows.length})` }]);

  // A stray second tab, as manual trackers always seem to have.
  const notes = wb.addWorksheet('Sheet1');
  notes.getCell('A1').value = 'Categories list - do not delete';
  COMPLAINT_CATEGORIES.forEach((c, i) => (notes.getCell(`A${i + 3}`).value = c));

  await wb.xlsx.writeFile(outPath);

  const closed = rows.filter((x) => x.days != null);
  return {
    rows: rows.length,
    closed: closed.length,
    open: rows.length - closed.length,
    meanDays: round(sum(closed.map((x) => x.days)) / closed.length, 3),
  };
}
