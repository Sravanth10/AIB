import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { DATA_DIR } from './store.js';

/**
 * Executive insight narrative.
 *
 * Two layers, the same shape as the Phase 1 classifier:
 *
 *   RULES     a deterministic summary composed from the computed trend, risk, cluster and
 *             demand outputs. Always available, costs nothing, cannot hallucinate.
 *   BEDROCK   Claude via Amazon Bedrock, given those same computed numbers and asked to
 *             write the commentary a governance lead would actually read.
 *
 * The model is given the arithmetic and asked to phrase it - it is never asked to work out
 * what the numbers are. Every figure it can quote has already been calculated.
 *
 * Results are cached on disk keyed by a hash of the inputs, so a demo never depends on a
 * live API call and a free-tier key cannot be throttled mid-presentation.
 */

const CACHE_DIR = path.join(DATA_DIR, 'narratives');
const BEDROCK_MODEL = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-opus-5';

const hasBedrockCredentials = () =>
  Boolean((process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) || process.env.AWS_PROFILE);

const fingerprint = (payload) =>
  crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);

function readCache(key) {
  const p = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value, null, 2) + '\n');
  return value;
}

// ------------------------------------------------------------------ shaping

const unitOf = (u) => (u === '%' ? '%' : u === 'seconds' ? 's' : u === 'days' ? 'd' : '');
const fmt = (v, u) => (v == null ? '—' : `${v}${unitOf(u)}`);

const isPlural = (n) => n !== 1;
const verb = (n, singular, plural) => (isPlural(n) ? plural : singular);

/**
 * Metric names read better mid-sentence in lower case, but blanket lowercasing turns TAT
 * into "tat" and QA into "qa" — which is exactly the sort of detail that costs you a room.
 */
const ACRONYMS = new Set(['TAT', 'QA', 'STP', 'ASA', 'AHT', 'FCR', 'SLA', 'UW']);
const metricPhrase = (name) =>
  name
    .split(' ')
    .map((w) => (ACRONYMS.has(w.replace(/[^A-Z]/g, '')) && w === w.toUpperCase() ? w : w.toLowerCase()))
    .join(' ');

/** The compact, already-computed brief both layers work from. */
function brief(intel) {
  return {
    scope: intel.scope,
    monthsAnalysed: intel.headline.monthsAnalysed,
    window: `${intel.months[0]?.label} to ${intel.focusLabel}`,
    horizon: intel.horizonLabel,
    headline: intel.headline,
    topRisks: intel.risk.slice(0, 4).map((r) => ({
      metric: r.name, source: r.source, current: fmt(r.current, r.unit), target: fmt(r.target, r.unit),
      projected: fmt(r.projected, r.unit), currentRag: r.currentRag, projectedRag: r.projectedRag,
      serviceCredit: r.serviceCredit, score: r.score, consecutiveDecline: r.consecutiveDecline,
      reasons: r.reasons,
    })),
    recurringCauses: intel.clusters.slice(0, 4).map((c) => ({
      driver: c.key, dimension: c.dimension, metric: c.metricName,
      worseByPct: c.avgDeltaPct, monthsWorse: `${c.monthsWorse} of ${c.monthsPresent}`,
      records: c.records, serviceCredit: c.serviceCredit,
    })),
    demand: Object.fromEntries(
      Object.entries(intel.demand).filter(([, v]) => v).map(([k, v]) => [
        k, { current: v.current, projected: v.projected, changePct: v.changePct, peakMonth: v.peakMonth },
      ]),
    ),
    stableMetrics: intel.trends.filter((t) => t.direction_label === 'stable' && t.observations > 1).map((t) => t.name),
  };
}

// ------------------------------------------------------------------- rules

/**
 * Deterministic narrative. This is not a placeholder — it is the version that runs whenever
 * Bedrock is unavailable, so it has to stand on its own in front of an audience.
 */
export function composeNarrative(intel) {
  const b = brief(intel);
  const paras = [];

  // 1. Where the estate stands and where it is heading.
  const newly = intel.risk.filter((r) => r.projectedBreach && !r.alreadyBreaching);
  const current = intel.headline.currentBreaches;
  const stable = intel.headline.stable;
  const lead =
    `Across ${b.monthsAnalysed} reporting periods (${b.window}), ${intel.headline.deteriorating} of 15 service levels are ` +
    `deteriorating materially and ${stable} ${verb(stable, 'is', 'are')} holding steady. ` +
    (current
      ? `${current} ${verb(current, 'metric is', 'metrics are')} currently in breach. `
      : 'No metric is currently in breach. ');
  const forecast = newly.length
    ? `On present trend, ${newly.length} further ${verb(newly.length, 'metric is', 'metrics are')} projected to breach in ${b.horizon}: ` +
      `${newly.map((r) => `${metricPhrase(r.name)} at ${fmt(r.projected, r.unit)} against a ${fmt(r.target, r.unit)} target`).join('; ')}.`
    : `No additional metric is projected to breach in ${b.horizon} on current trend.`;
  paras.push(lead + forecast);

  // 2. The single most pressing item, with its evidence.
  const top = intel.risk[0];
  if (top) {
    const credit = intel.risk.filter((r) => r.projectedBreach && r.serviceCredit);
    paras.push(
      `The most pressing exposure is ${metricPhrase(top.name)} (${top.source}), ${top.reasons.join(', ')}. ` +
        (credit.length
          ? `${credit.length} of the metrics at risk next month ${verb(credit.length, 'carries', 'carry')} a service-credit consequence, ` +
            `so the financial exposure is contractual rather than reputational.`
          : `No metric at risk next month carries a service-credit consequence.`),
    );
  }

  // 3. Where the problem actually lives.
  if (b.recurringCauses.length) {
    const c = b.recurringCauses[0];
    const others = b.recurringCauses.slice(1, 3);
    const named = 1 + others.length; // only claim credit for the drivers actually named
    paras.push(
      `The pattern is concentrated rather than general: ${c.driver} runs ${c.worseByPct}% worse than the ` +
        `${metricPhrase(c.metric)} average and has done so in ${c.monthsWorse} months` +
        (others.length
          ? `, alongside ${others.map((o) => `${o.driver} (${o.worseByPct}% on ${metricPhrase(o.metric)})`).join(' and ')}. ` +
            `Remediation targeted at those ${named} drivers would address the majority of recurring breaches.`
          : '. Remediation targeted there would address the bulk of recurring breaches.'),
    );
  }

  // 4. What is coming through the door.
  const d = b.demand;
  const demandBits = [];
  // A flat line is not a forecast worth reporting — only mention what actually moves.
  const moves = (v) => v && Math.abs(v.changePct) >= 1;
  if (moves(d.calls)) demandBits.push(`contact centre volume ${d.calls.changePct > 0 ? 'up' : 'down'} ${Math.abs(d.calls.changePct)}% to roughly ${d.calls.projected.toLocaleString()} calls`);
  if (moves(d.complaints)) demandBits.push(`complaint volume ${d.complaints.changePct > 0 ? 'up' : 'down'} ${Math.abs(d.complaints.changePct)}%`);
  if (moves(d.escalations)) demandBits.push(`escalations ${d.escalations.changePct > 0 ? 'up' : 'down'} ${Math.abs(d.escalations.changePct)}%`);
  if (demandBits.length) {
    paras.push(
      `Demand into ${b.horizon} projects ${demandBits.join(', ')}` +
        (d.calls?.peakMonth ? `, against a ${d.calls.peakMonth} peak in the observed period.` : '.'),
    );
  }

  return paras.join('\n\n');
}

// ----------------------------------------------------------------- bedrock

const SYSTEM_PROMPT = `You write the executive summary at the top of a monthly SLA governance pack for an Irish life assurance business.

You are given figures that have ALREADY been calculated by a deterministic engine: trend direction, breach projections, recurring cause clusters and demand forecasts. Your job is to phrase them, not to compute or infer anything new.

Rules:
- Never state a number that is not in the input. Never round differently or recompute.
- 3 to 4 short paragraphs, no headings, no bullet points, no preamble.
- Lead with what is about to go wrong and what it will cost, not with what already happened.
- Name the specific drivers (branch, queue, service, category) when the input identifies them.
- Say plainly when metrics are stable — a governance audience needs to know the system is not crying wolf.
- British/Irish English. Plain, direct, unhedged. No marketing language, no "leverage", no "journey".
- A senior governance lead should grasp the position in ten seconds.`;

async function bedrockNarrative(intel) {
  const { AnthropicBedrockMantle } = await import('@anthropic-ai/bedrock-sdk');
  const client = new AnthropicBedrockMantle({
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1',
  });

  const response = await client.messages.create({
    model: BEDROCK_MODEL,
    max_tokens: 1400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Write the executive insight summary from these computed figures:\n\n${JSON.stringify(brief(intel), null, 2)}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (!text) throw new Error('Bedrock returned no text');
  return text;
}

// -------------------------------------------------------------- entrypoint

export async function generateNarrative(intel, { refresh = false } = {}) {
  const key = fingerprint(brief(intel));

  if (!refresh) {
    const cached = readCache(key);
    if (cached) return { ...cached, cached: true };
  }

  if (hasBedrockCredentials()) {
    try {
      const text = await bedrockNarrative(intel);
      return writeCache(key, { text, source: 'bedrock', model: BEDROCK_MODEL, generatedAt: new Date().toISOString() });
    } catch (err) {
      // Never let a credential, quota or network problem take the panel down mid-demo.
      const text = composeNarrative(intel);
      return { text, source: 'rules', fallbackReason: err.message, generatedAt: new Date().toISOString(), cached: false };
    }
  }

  return writeCache(key, { text: composeNarrative(intel), source: 'rules', generatedAt: new Date().toISOString() });
}

export const narrativeStatus = () => ({
  bedrockConfigured: hasBedrockCredentials(),
  model: BEDROCK_MODEL,
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1',
});
