import { SCENARIO, ESCALATION_CATEGORIES } from '../scenario.js';
import { rng, fitMean, randFloat, randInt, pick, round, sum } from '../lib/num.js';
import { weeksOf, addDays, monthLabel, fmtEmail, MONTH_ABBR, daysInMonth, dayOfMonth } from '../lib/dates.js';
import { createDoc, finish, MARGIN } from '../lib/pdf.js';

/**
 * Manual email feed (PDF) - a printed forwarded Outlook thread of weekly escalation summaries.
 *
 * Distinguishing cues for the classifier: From/Sent/To/Subject headers, "FW:" subject lines,
 * "-----Original Message-----" separators, prose paragraphs and a sign-off. There is no
 * tabular grid at all, which is what separates it from the Azure PDF.
 *
 * Metric: MAN_ESCALATION_TAT = mean resolution days across every escalation line in the month.
 */

const SENDERS = [
  { name: 'Aoife Dunne', email: 'aoife.dunne@aiblife.demo', role: 'Escalations Lead, Customer Operations' },
];
const RECIPIENT = 'SLA Governance <sla.governance@aiblife.demo>';

const CLOSING = [
  'Shout if you need the underlying case notes.',
  'Detail is on the shared drive as usual.',
  'Happy to walk through any of these on the Ops call.',
  'Flagging the payment-delay cluster again this week.',
  'No FSPO referrals arising this week.',
];

function line(doc, text, opts = {}) {
  doc.font(opts.font || 'Helvetica').fontSize(opts.size || 9).fillColor(opts.color || '#22303f');
  doc.text(text, { width: doc.page.width - MARGIN * 2, ...opts });
}

export async function generateEmailFeed(monthKey, outPath) {
  const sc = SCENARIO[monthKey];
  const r = rng(sc.seed + 55);
  const weeks = weeksOf(monthKey);
  const perWeek = sc.volumes.escalationsPerWeek;
  const target = sc.values.MAN_ESCALATION_TAT;
  const dim = daysInMonth(monthKey);

  const total = perWeek.slice(0, weeks.length).reduce((a, b) => a + b, 0);
  const seed = Array.from({ length: total }, () => randFloat(r, target * 0.35, target * 2.0));
  const durations = fitMean(seed, target, 1, 0.3);

  let cursor = 0;
  let refNo = 400 + randInt(r, 1, 40);
  const weekly = weeks.map((w, wi) => {
    const count = perWeek[wi] ?? 4;
    const span = Math.round((w.end - w.start) / 86400000);
    const items = Array.from({ length: count }, () => {
      const raised = addDays(w.start, randInt(r, 0, Math.max(0, span)));
      const days = durations[cursor++];
      return {
        ref: `ESC-${monthKey.slice(0, 4)}-${String(refNo++).padStart(4, '0')}`,
        raised,
        resolved: addDays(raised, Math.max(1, Math.round(days))),
        days,
        category: pick(r, ESCALATION_CATEGORIES),
      };
    }).sort((a, b) => a.raised - b.raised);
    return { week: w, items, mean: round(sum(items.map((i) => i.days)) / items.length, 1) };
  });

  const { doc, done } = createDoc(outPath);
  const sender = SENDERS[0];
  const wrapperSent = dayOfMonth(monthKey, dim);

  // Label and value are positioned independently: pdfkit's `continued: true` makes the
  // second run inherit the label's narrow width, which shreds long addresses and subjects.
  const headerBox = (from, sent, subject, to = RECIPIENT) => {
    const pairs = [
      ['From:', from],
      ['Sent:', sent],
      ['To:', to],
      ['Subject:', subject],
    ];
    const lineH = 11;
    const boxH = pairs.length * lineH + 12;
    const y0 = doc.y;
    doc.save().rect(MARGIN, y0, doc.page.width - MARGIN * 2, boxH).fill('#f2f5f9').restore();
    pairs.forEach(([k, v], i) => {
      const y = y0 + 6 + i * lineH;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#5b6b7d').text(k, MARGIN + 8, y, { width: 46, lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor('#1f2d3d').text(v, MARGIN + 56, y, {
        width: doc.page.width - MARGIN * 2 - 64,
        lineBreak: false,
        ellipsis: true,
      });
    });
    doc.y = y0 + boxH + 8;
  };

  const separator = (label) => {
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(8).fillColor('#8a97a6').text(`-----${label}-----`, MARGIN, doc.y, { align: 'left' });
    doc.moveDown(0.6);
    doc.fillColor('#22303f');
  };

  // --- Covering forward -----------------------------------------------------
  headerBox(
    `${sender.name} <${sender.email}>`,
    `${fmtEmail(wrapperSent)} 17:42`,
    `FW: Weekly Escalation Summary - ${monthLabel(monthKey)} (consolidated)`,
  );

  const monthMean = round(sum(weekly.flatMap((w) => w.items.map((i) => i.days))) / total, 1);
  line(doc, 'Hi all,');
  doc.moveDown(0.4);
  line(
    doc,
    `Forwarding the weekly escalation summaries for ${monthLabel(monthKey)} in one thread for the governance pack. ` +
      `${total} escalations raised and closed across the period. Average resolution time for the month is ${monthMean.toFixed(1)} days ` +
      `against the 2.0 day target.`,
  );
  doc.moveDown(0.4);
  line(doc, pick(r, CLOSING));
  doc.moveDown(0.5);
  line(doc, 'Thanks,');
  line(doc, sender.name);
  line(doc, sender.role, { size: 8, color: '#7a8899' });
  line(doc, 'AIB Life | Customer Operations', { size: 8, color: '#7a8899' });

  // --- The chain, newest first ---------------------------------------------
  for (let i = weekly.length - 1; i >= 0; i--) {
    const w = weekly[i];
    if (doc.y > doc.page.height - 260) doc.addPage();

    separator('Original Message');
    // Summaries go out the next working day, not over the weekend.
    let sent = addDays(w.week.end, 1);
    while (sent.getUTCDay() === 0 || sent.getUTCDay() === 6) sent = addDays(sent, 1);
    const range = `${String(w.week.start.getUTCDate()).padStart(2, '0')}-${String(w.week.end.getUTCDate()).padStart(2, '0')} ${MONTH_ABBR[w.week.start.getUTCMonth()]} ${w.week.start.getUTCFullYear()}`;
    headerBox(
      `${sender.name} <${sender.email}>`,
      `${fmtEmail(sent)} 08:${String(randInt(r, 10, 55)).padStart(2, '0')}`,
      `Weekly Escalation Summary - ${w.week.label} (${range})`,
    );

    line(
      doc,
      `Escalation summary for the week ending ${fmtEmail(w.week.end)}. ${w.items.length} escalations logged, all closed. ` +
        `Average resolution ${w.mean.toFixed(1)} days.`,
    );
    doc.moveDown(0.5);

    for (const it of w.items) {
      const raised = `${String(it.raised.getUTCDate()).padStart(2, '0')} ${MONTH_ABBR[it.raised.getUTCMonth()]}`;
      const resolved = `${String(it.resolved.getUTCDate()).padStart(2, '0')} ${MONTH_ABBR[it.resolved.getUTCMonth()]}`;
      line(
        doc,
        `  ${it.ref}   Raised ${raised}   Resolved ${resolved}   ${it.days.toFixed(1)} days   ${it.category}   Closed`,
        { font: 'Courier', size: 8 },
      );
    }

    doc.moveDown(0.5);
    line(doc, 'Regards,');
    line(doc, sender.name);
    line(doc, sender.role, { size: 8, color: '#7a8899' });
  }

  await finish(doc, done);

  return { escalations: total, weeks: weekly.length, meanDays: monthMean };
}
