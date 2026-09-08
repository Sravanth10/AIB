import AskReport from './AskReport.jsx';
import { IconSpark, IconAlert, IconCircleCheck } from './Icons.jsx';

/**
 * The executive summary.
 *
 * Three things carry the "grasp it in ten seconds" claim, and none of them is decoration:
 *
 *  VERDICT     one computed line at the top, derived from the data rather than parsed out
 *              of the prose, so it is exact regardless of how the model phrased things.
 *  FIGURES     numbers inside the prose are visually lifted, because the figures are what
 *              a governance reader scans for.
 *  STRUCTURE   the narrative is written to a fixed running order, so each paragraph gets
 *              its own marker and heading — turning a block of text into four findings.
 */

/**
 * Label a paragraph by what it actually says, not by its position.
 *
 * The narrative is written to a running order, but the model sometimes merges two sections
 * into one paragraph — and a positional label then names the wrong thing, which is worse
 * than no label at all. Unrecognised paragraphs simply go unlabelled.
 */
const TOPICS = [
  { label: 'Demand ahead', test: /\bdemand|call volume|forecast volume|volumes?\b/i },
  { label: 'Where it is concentrated', test: /\bconcentrat|branch|queue|categor|driver|remediat/i },
  { label: 'Most pressing', test: /\bmost pressing|single|highest risk|priorit/i },
  { label: 'Outlook', test: /\bat risk|projected|breach|next month|forecast/i },
];

const labelFor = (paragraph) => TOPICS.find((t) => t.test.test(paragraph))?.label ?? null;

/**
 * Lift figures out of the prose without touching the words around them.
 *
 * Years are deliberately excluded — "September 2026" is a date, not a measurement, and
 * boxing the year makes the sentence read like a spreadsheet.
 */
// The word-boundary anchors sit only on the alphabetic units. A trailing \b after "%" can
// never match — "%" and the following space are both non-word characters — which silently
// backtracks the unit off the match and leaves "5.9 %" split across the highlight.
const FIGURE_RE = /\b\d+(?:,\d{3})*(?:\.\d+)?(?:\s?%|\s?days?\b|\s?d\b|\s?s\b|\s?calls\b)?/g;
const isYear = (token) => /^(?:19|20)\d{2}$/.test(token.trim());

function highlightFigures(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(FIGURE_RE)) {
    const token = m[0];
    if (isYear(token)) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<b key={`${m.index}-${token}`} className="fig">{token}</b>);
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** The headline finding, computed from the data — never parsed out of the narrative. */
function verdictOf(data) {
  const creditAtRisk = data.risk.filter((r) => r.projectedBreach && r.serviceCredit);
  const creditTotal = data.trends.filter((t) => t.serviceCredit).length;
  const atRisk = data.risk.filter((r) => r.projectedBreach);

  if (creditAtRisk.length) {
    return {
      tone: 'severe',
      headline: `${creditAtRisk.length} of ${creditTotal} service-credit metrics at risk in ${data.horizonLabel}`,
      detail: creditAtRisk.map((r) => r.name).join(' · '),
    };
  }
  if (atRisk.length) {
    return {
      tone: 'warn',
      headline: `${atRisk.length} metric${atRisk.length === 1 ? '' : 's'} projected to breach in ${data.horizonLabel}`,
      detail: 'No service-credit exposure forecast for this period.',
    };
  }
  return {
    tone: 'clear',
    headline: `No metric projected to breach in ${data.horizonLabel}`,
    detail: `${data.headline.stable} of 15 service levels holding steady across the window.`,
  };
}

export default function NarrativeCard({ data, scope }) {
  const narrative = data.narrative;
  if (!narrative) return null;

  const paragraphs = narrative.text
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text, i) => ({ text, label: labelFor(text), key: i }));

  // Only run the labelled layout when most paragraphs resolved to a topic — a half-labelled
  // list looks like a rendering fault rather than a design.
  const labelled = paragraphs.filter((p) => p.label).length >= Math.ceil(paragraphs.length / 2);
  const verdict = verdictOf(data);

  return (
    <section className="narrative-card">
      <div className="narrative-glow" aria-hidden="true" />

      <header className="narrative-top">
        <div className="row" style={{ gap: 10 }}>
          <span className="narrative-mark"><IconSpark size={15} /></span>
          <div>
            <h2>Executive insight</h2>
            <div className="narrative-scope">
              {scope === 'all' ? `All history · ${data.headline.monthsAnalysed} periods` : data.focusLabel}
            </div>
          </div>
        </div>
        <span className="narrative-source">
          {narrative.source === 'bedrock' ? narrative.model : 'Computed figures'}
          {narrative.cached ? ' · cached' : ''}
        </span>
      </header>

      <div className={`verdict tone-${verdict.tone}`}>
        <span className="verdict-icon">
          {verdict.tone === 'clear' ? <IconCircleCheck size={19} /> : <IconAlert size={19} />}
        </span>
        <div>
          <div className="verdict-headline">{verdict.headline}</div>
          <div className="verdict-detail">{verdict.detail}</div>
        </div>
      </div>

      <div className={`narrative-body${labelled ? ' is-labelled' : ''}`}>
        {paragraphs.map((p, i) => (
          <div className="narrative-para" key={p.key}>
            {labelled && p.label && (
              <div className="para-marker">
                <span className="para-num">{i + 1}</span>
                <span className="para-label">{p.label}</span>
              </div>
            )}
            <p>{highlightFigures(p.text)}</p>
          </div>
        ))}
      </div>

      <AskReport key={scope} scope={scope} suggestions={data.suggestedQuestions ?? []} />
    </section>
  );
}
