import { SLA_METRICS } from './slaEngine.js';
import { bedrockText, unsupportedFigures, bedrockAvailable, activeModel } from './narrative.js';

/**
 * A Q&A layer over the Phase 2 outputs — not a general-purpose assistant.
 *
 * It answers questions about THIS report using only figures the engine has already
 * computed. It has no tools, no retrieval, no conversation memory and no knowledge of
 * anything outside the intelligence payload it is handed. Ask it about the weather and it
 * says it only covers the SLA report.
 *
 * The same fabrication guard as the narrative applies: an answer quoting a figure that is
 * not in its own context is discarded in favour of the deterministic one.
 */

const unitOf = (u) => (u === '%' ? '%' : u === 'seconds' ? 's' : u === 'days' ? 'd' : '');
const fmt = (v, u) => (v == null ? 'no data' : `${v}${unitOf(u)}`);

// Words too generic to identify a metric on their own.
const STOP = new Set([
  'the', 'is', 'are', 'was', 'why', 'what', 'which', 'how', 'and', 'for', 'our', 'this',
  'that', 'flagged', 'risk', 'breach', 'breaching', 'metric', 'metrics', 'sla', 'slas',
  'month', 'months', 'next', 'now', 'we', 'it', 'in', 'on', 'at', 'of', 'to', 'a', 'an',
  'doing', 'going', 'about', 'tell', 'me', 'show', 'explain', 'driving', 'worst', 'report',
]);

const tokens = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));

/**
 * How people actually refer to these metrics in a governance meeting. Nobody says
 * "claims processing time" out loud — they say "claims TAT".
 */
const ALIASES = {
  BANCS_NB_TAT: ['new business', 'nb', 'issuance', 'tat'],
  BANCS_UW_TAT: ['underwriting', 'uw', 'tat'],
  BANCS_CLAIMS_TAT: ['claims', 'claim', 'tat'],
  BANCS_ENDORSE_TAT: ['endorsement', 'alteration', 'tat'],
  BANCS_STP_ACC: ['stp', 'accuracy', 'straight through', 'rework'],
  AWS_ASA: ['asa', 'answer', 'speed', 'waiting'],
  AWS_ABANDON: ['abandonment', 'abandoned', 'dropped'],
  AWS_FCR: ['fcr', 'first call', 'resolution'],
  AWS_AHT: ['aht', 'handle', 'talk'],
  AWS_QA: ['qa', 'quality', 'score'],
  AZ_UPTIME: ['uptime', 'availability', 'downtime', 'outage'],
  AZ_BATCH: ['batch', 'overnight', 'job'],
  AZ_REFRESH: ['refresh', 'timeliness', 'data feed'],
  MAN_COMPLAINT_TAT: ['complaint', 'complaints', 'tat'],
  MAN_ESCALATION_TAT: ['escalation', 'escalations', 'tat'],
};

/**
 * Which metric is the question about?
 *
 * Plain token counting is not enough: "Claims TAT" scores one hit on claims processing time
 * while "TAT" appears in five other metric names. So tokens are weighted by how many metrics
 * they appear across — a token unique to one metric ("claims", "uptime") is decisive on its
 * own, and a token shared by many ("tat", "time") barely counts.
 *
 * Returns null when nothing scores well enough. Answering generally is better than
 * answering confidently about the wrong metric.
 */
export function resolveMetric(question) {
  const qt = tokens(question);
  if (!qt.length) return null;

  const vocab = SLA_METRICS.map((m) => ({
    metric: m,
    terms: new Set([...tokens(m.name), ...tokens(m.source), ...(ALIASES[m.id] ?? []).flatMap(tokens)]),
  }));

  // How many metrics does each term belong to? Rarer means more identifying.
  const spread = new Map();
  for (const v of vocab) for (const t of v.terms) spread.set(t, (spread.get(t) ?? 0) + 1);

  let best = null;
  for (const v of vocab) {
    let score = 0;
    for (const t of qt) {
      const hit = [...v.terms].some(
        (n) => n === t || (t.length > 3 && n.startsWith(t)) || (n.length > 3 && t.startsWith(n)),
      );
      if (hit) score += 1 / (spread.get(t) ?? 1);
    }
    if (score > 0 && (!best || score > best.score)) best = { id: v.metric.id, metric: v.metric, score };
  }

  // 0.5 clears any term shared by at most two metrics, but not "tat" or "time" alone.
  return best && best.score >= 0.5 ? best : null;
}

/** Everything known about one metric, assembled from the computed payload. */
function metricContext(intel, id) {
  const trend = intel.trends.find((t) => t.id === id);
  const risk = intel.risk.find((r) => r.id === id);
  const clusters = intel.clusters.filter((c) => c.metricId === id);
  return { trend, risk, clusters };
}

/** The grounding context handed to the model — computed figures only. */
function buildContext(intel, question) {
  const match = resolveMetric(question);

  const base = {
    reportWindow: `${intel.months[0]?.label} to ${intel.focusLabel}`,
    periodsAnalysed: intel.headline.monthsAnalysed,
    forecastMonth: intel.horizonLabel,
    headline: intel.headline,
    topRisks: intel.risk.slice(0, 6).map((r) => ({
      metric: r.name, source: r.source, current: fmt(r.current, r.unit), target: fmt(r.target, r.unit),
      forecastNextMonth: fmt(r.projected, r.unit), statusNow: r.currentRag, statusForecast: r.projectedRag,
      riskScore: r.score, serviceCredit: r.serviceCredit, evidence: r.reasons,
    })),
    recurringCauses: intel.clusters.slice(0, 6).map((c) => ({
      driver: c.key, dimension: c.dimension, affectsMetric: c.metricName,
      pctWorseThanAverage: c.avgDeltaPct, periodsWorse: `${c.monthsWorse} of ${c.monthsPresent}`,
      records: c.records,
    })),
    stableMetrics: intel.trends.filter((t) => t.direction_label === 'stable' && t.observations > 1).map((t) => t.name),
    demandForecast: Object.fromEntries(
      Object.entries(intel.demand).filter(([, v]) => v).map(([k, v]) => [
        k, { latestMonthVolume: v.current, forecastFor: intel.horizonLabel, forecastVolume: v.projected, forecastChangePct: v.changePct },
      ]),
    ),
  };

  if (!match) return { ...base, questionAboutSpecificMetric: false };

  const { trend, risk, clusters } = metricContext(intel, match.id);
  return {
    ...base,
    questionAboutSpecificMetric: true,
    metricInQuestion: {
      name: trend.name,
      source: trend.source,
      target: `${trend.direction === 'lower_is_better' ? 'at most' : 'at least'} ${fmt(trend.target, trend.unit)}`,
      toleranceBand: fmt(trend.amberTolerance, trend.unit),
      serviceCredit: trend.serviceCredit,
      historyByMonth: trend.points.filter((p) => p.value != null).map((p) => ({
        month: p.label, value: fmt(p.value, trend.unit), status: p.rag,
      })),
      overallDirection: trend.direction_label,
      currentValue: fmt(trend.current, trend.unit),
      riskScore: risk?.score ?? null,
      forecastNextMonth: risk ? fmt(risk.projected, risk.unit) : null,
      forecastStatus: risk?.projectedRag ?? null,
      whyFlagged: risk?.reasons ?? [],
      drivers: clusters.map((c) => ({
        driver: c.key, dimension: c.dimension, pctWorseThanAverage: c.avgDeltaPct,
        periodsWorse: `${c.monthsWorse} of ${c.monthsPresent}`, records: c.records,
      })),
    },
  };
}

// --------------------------------------------------------------- rules answer

/**
 * Deterministic answer. Runs whenever Bedrock is unavailable or its answer fails the guard,
 * so it has to be genuinely useful rather than an apology.
 */
export function composeAnswer(intel, question) {
  const match = resolveMetric(question);

  if (!match) {
    const top = intel.risk.slice(0, 3);
    if (!top.length) return 'There is not enough history in this report to answer that yet.';
    return (
      `This report covers ${intel.headline.monthsAnalysed} periods to ${intel.focusLabel}. ` +
      `The highest-risk metrics for ${intel.horizonLabel} are ` +
      top.map((r) => `${r.name} (${fmt(r.current, r.unit)} → ${fmt(r.projected, r.unit)}, risk ${r.score})`).join(', ') +
      `. ${intel.headline.recurringCauses} recurring cause${intel.headline.recurringCauses === 1 ? '' : 's'} ` +
      `${intel.headline.recurringCauses === 1 ? 'was' : 'were'} identified across the window. ` +
      `Ask about a specific metric by name for its full history and drivers.`
    );
  }

  const { trend, risk, clusters } = metricContext(intel, match.id);
  const parts = [];

  const series = trend.points.filter((p) => p.value != null);
  parts.push(
    `${trend.name} (${trend.source}) targets ${trend.direction === 'lower_is_better' ? 'at most' : 'at least'} ` +
      `${fmt(trend.target, trend.unit)} and currently sits at ${fmt(trend.current, trend.unit)}. ` +
      `Across the window it ran ${series.map((p) => `${p.label.split(' ')[0].slice(0, 3)} ${fmt(p.value, trend.unit)}`).join(', ')} — ${trend.direction_label}.`,
  );

  if (risk) {
    parts.push(
      `It carries a risk score of ${risk.score} for ${intel.horizonLabel}, projected at ` +
        `${fmt(risk.projected, risk.unit)} (${risk.projectedRag === 'RED' ? 'a breach' : risk.projectedRag === 'AMBER' ? 'inside tolerance' : 'on target'}). ` +
        `That is because ${risk.reasons.join(', ')}.`,
    );
  }

  if (clusters.length) {
    parts.push(
      `The delay is concentrated: ` +
        clusters.slice(0, 3).map((c) => `${c.key} (${c.dimension}) runs ${c.avgDeltaPct}% worse than average in ${c.monthsWorse} of ${c.monthsPresent} periods`).join('; ') +
        `.`,
    );
  } else {
    parts.push('No single branch, queue or category stands out as a recurring driver for this metric.');
  }

  if (trend.serviceCredit) {
    parts.push('This metric carries a service-credit consequence, so a breach has a contractual cost.');
  }

  return parts.join(' ');
}

// ------------------------------------------------------------- model answer

const SYSTEM_PROMPT = `You answer questions about one specific SLA governance report for an Irish life assurance business.

You are given figures ALREADY COMPUTED by a deterministic engine. Answer only from them.

Rules:
- Never state a number that is not in the context. Never recompute, re-round or estimate.
- Read field names literally. "forecastFor" is a future month; "historyByMonth" is the past.
- 2 to 4 sentences. No headings, no bullets, no preamble, no sign-off.
- "What should we prioritise / focus on / worry about" IS answerable: topRisks is already
  ranked by riskScore, highest first, and metrics with serviceCredit true carry a
  contractual cost. Answer with those, highest risk first. Do not say the report offers no
  recommendations.
- "Why is X flagged" is answered by that metric's whyFlagged, its historyByMonth and its
  drivers, all in metricInQuestion when the question named a metric.
- If the context genuinely does not contain the answer, say so plainly in one sentence and
  name what the report does cover. Never speculate and never draw on outside knowledge.
- If the question is not about this SLA report, say that you only cover this report.
- Never use "only", "sole" or "the single" about a count unless that count is exactly 1.
- British/Irish English. Plain and direct. No marketing language.`;

export async function askAssistant(intel, question, { allowModel = true } = {}) {
  const trimmed = String(question ?? '').trim();
  if (!trimmed) return { answer: 'Ask a question about this report.', source: 'rules' };

  const context = buildContext(intel, trimmed);
  const matched = resolveMetric(trimmed);
  const grounding = { matchedMetric: matched?.metric.name ?? null };

  if (allowModel && bedrockAvailable()) {
    try {
      const text = await bedrockText({
        system: SYSTEM_PROMPT,
        user: `Report context:\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${trimmed}`,
        maxTokens: 500,
        temperature: 0.15,
      });
      if (!text) throw new Error('empty answer');

      const invented = unsupportedFigures(text, context);
      if (invented.length) throw new Error(`answer quoted figures absent from the report: ${invented.join(', ')}`);

      return { answer: text, source: 'bedrock', model: activeModel(), ...grounding };
    } catch (err) {
      return { answer: composeAnswer(intel, trimmed), source: 'rules', fallbackReason: err.message, ...grounding };
    }
  }

  return { answer: composeAnswer(intel, trimmed), source: 'rules', ...grounding };
}

/** Starter questions, built from what this particular report actually contains. */
export function suggestedQuestions(intel) {
  const out = [];
  const topRisk = intel.risk.find((r) => r.projectedBreach) ?? intel.risk[0];
  if (topRisk) out.push(`Why is ${topRisk.name.split(' / ')[0]} flagged?`);
  if (intel.clusters[0]) out.push(`What is driving the ${intel.clusters[0].key} problem?`);
  out.push(`What should we prioritise for ${intel.horizonLabel}?`);
  if (intel.headline.stable > 0) out.push('Which metrics are holding steady?');
  return out.slice(0, 4);
}
