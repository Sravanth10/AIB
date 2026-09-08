import { SLA_METRICS, metricById, ragFor } from './slaEngine.js';
import { listMonths, readAnalysis, monthLabel } from './store.js';

/**
 * Phase 2 — operational intelligence over the Phase 1 history.
 *
 * Everything here is deliberately lightweight statistics rather than a trained model:
 * trend slope, distance to threshold, consistency of direction, and grouping by shared
 * attributes. For a prototype that is not a compromise — it is the point. Every number the
 * risk panel shows can be explained in one sentence to a governance audience, which a
 * fitted model could not be.
 */

const nextMonthKey = (key) => {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const round = (v, dp = 2) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

/**
 * Put every metric on a common axis where HIGHER ALWAYS MEANS WORSE, so one set of trend
 * maths works for "days, lower is better" and "percent, higher is better" alike.
 */
const toWorse = (metric, value) => (value == null ? null : metric.direction === 'lower_is_better' ? value : -value);
const fromWorse = (metric, w) => (w == null ? null : metric.direction === 'lower_is_better' ? w : -w);

/** Least-squares slope per month. */
function slopeOf(values) {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ---------------------------------------------------------------- history

/** Every generated pack, oldest first. */
export function loadHistory() {
  return listMonths()
    .map((month) => readAnalysis(month))
    .filter(Boolean)
    .sort((a, b) => a.reporting_month.localeCompare(b.reporting_month));
}

// ------------------------------------------------------------------ trend

/** Per-metric series across the history, for the trend chart. */
export function buildTrends(history) {
  return SLA_METRICS.map((metric) => {
    const points = history.map((h) => {
      const r = h.sla_results.find((x) => x.id === metric.id);
      return {
        month: h.reporting_month,
        label: monthLabel(h.reporting_month),
        value: r?.actual ?? null,
        rag: r?.rag ?? 'NO_DATA',
      };
    });

    const scored = points.filter((p) => p.value != null);
    const worseSeries = scored.map((p) => toWorse(metric, p.value));
    const slopeWorse = slopeOf(worseSeries);

    // How consistently is it moving the wrong way? A metric that declined every single
    // month is a different proposition from one that bounced around to the same average.
    let worseningSteps = 0;
    for (let i = 1; i < worseSeries.length; i++) if (worseSeries[i] > worseSeries[i - 1]) worseningSteps++;
    const consistency = worseSeries.length > 1 ? worseningSteps / (worseSeries.length - 1) : 0;

    return {
      id: metric.id,
      name: metric.name,
      source: metric.source,
      unit: metric.unit,
      target: metric.target,
      direction: metric.direction,
      amberTolerance: metric.amberTolerance,
      serviceCredit: !!metric.serviceCredit,
      points,
      observations: scored.length,
      slope: round(fromWorse(metric, slopeWorse) - fromWorse(metric, 0), 3),
      slopeWorse: round(slopeWorse, 4),
      consistency: round(consistency, 2),
      current: scored.length ? scored[scored.length - 1].value : null,
      first: scored.length ? scored[0].value : null,
      direction_label: directionLabel(metric, slopeWorse),
    };
  });
}

/**
 * Movement is only worth reporting if it is material relative to the metric's own tolerance.
 *
 * An absolute threshold would call almost everything "deteriorating" — over any window
 * containing one bad month, nearly every series has a slightly positive slope. Requiring a
 * quarter of a tolerance band per month is what keeps the panel from crying wolf, and is why
 * genuinely stable metrics still read as stable.
 */
const MATERIAL_SLOPE = 0.25;

function directionLabel(metric, slopeWorse) {
  const threshold = MATERIAL_SLOPE * (metric.amberTolerance || 1);
  if (slopeWorse > threshold) return 'deteriorating';
  if (slopeWorse < -threshold) return 'improving';
  return 'stable';
}

// ------------------------------------------------------------------- risk

/**
 * Breach risk for the month after the history ends.
 *
 * Two ingredients, both explainable:
 *   PROJECTION   last value plus the recent trend slope, expressed in tolerance units
 *                relative to the point at which the metric formally breaches
 *   CONSISTENCY  how much of the recent movement has been in the wrong direction
 *
 * A metric sitting comfortably inside target but falling fast can outrank one that is
 * already amber but stable — which is the whole argument for predictive governance.
 */
export function buildRisk(trends, { window = 4 } = {}) {
  return trends
    .map((t) => {
      const metric = metricById(t.id);
      const scored = t.points.filter((p) => p.value != null);
      if (scored.length < 2) return null;

      const recent = scored.slice(-window);
      const worse = recent.map((p) => toWorse(metric, p.value));
      const slope = slopeOf(worse);
      const lastWorse = worse[worse.length - 1];

      const projectedWorse = lastWorse + slope;
      const projected = round(fromWorse(metric, projectedWorse), 2);

      // The line beyond which the metric is formally in breach, on the worse-is-higher axis.
      const breachLineWorse = toWorse(metric, metric.target) + metric.amberTolerance;
      const toleranceUnits = (projectedWorse - breachLineWorse) / (metric.amberTolerance || 1);

      let recentWorsening = 0;
      for (let i = 1; i < worse.length; i++) if (worse[i] > worse[i - 1]) recentWorsening++;
      const consistency = worse.length > 1 ? recentWorsening / (worse.length - 1) : 0;

      // Squash tolerance units into 0..1: at the breach line = 0.5, one tolerance band clear
      // either side moves it to roughly 0.25 / 0.75.
      const proximity = clamp01(0.5 + toleranceUnits / 4);
      const score = Math.round(100 * clamp01(proximity * 0.68 + consistency * 0.32));

      const currentRag = ragFor(metric, scored[scored.length - 1].value);
      const projectedRag = ragFor(metric, projected);

      return {
        id: t.id,
        name: t.name,
        source: t.source,
        unit: t.unit,
        target: metric.target,
        direction: metric.direction,
        amberTolerance: metric.amberTolerance,
        serviceCredit: t.serviceCredit,
        current: scored[scored.length - 1].value,
        currentRag,
        projected,
        projectedRag,
        projectedBreach: projectedRag === 'RED',
        alreadyBreaching: currentRag === 'RED',
        score,
        consistency: round(consistency, 2),
        monthsObserved: recent.length,
        consecutiveDecline: countTrailingDecline(worse),
        reasons: buildReasons({ metric, recent, worse, consistency, projected, projectedRag, currentRag }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(b.serviceCredit) - Number(a.serviceCredit));
}

function countTrailingDecline(worse) {
  let n = 0;
  for (let i = worse.length - 1; i > 0; i--) {
    if (worse[i] > worse[i - 1]) n++;
    else break;
  }
  return n;
}

/** Plain-language justifications — the risk panel shows these verbatim. */
function buildReasons({ metric, recent, worse, consistency, projected, projectedRag, currentRag }) {
  const out = [];
  const decline = countTrailingDecline(worse);
  const unit = metric.unit === '%' ? '%' : metric.unit === 'seconds' ? 's' : metric.unit === 'days' ? 'd' : '';

  if (decline >= 2) out.push(`${decline} consecutive months moving the wrong way`);
  else if (consistency >= 0.6) out.push(`declined in ${Math.round(consistency * 100)}% of recent months`);
  else if (consistency === 0) out.push('stable or improving across the window');

  if (projectedRag === 'RED' && currentRag !== 'RED') {
    out.push(`projected ${projected}${unit} next month against a ${metric.target}${unit} target`);
  } else if (currentRag === 'RED') {
    out.push(`already in breach at ${recent[recent.length - 1].value}${unit}`);
  } else {
    const gap = Math.abs(recent[recent.length - 1].value - metric.target);
    out.push(`${round(gap, 2)}${unit} from target`);
  }

  if (metric.serviceCredit) out.push('carries a service-credit consequence');
  return out;
}

// -------------------------------------------------------------- clustering

/**
 * Recurring failure points.
 *
 * For each metric, a dimension value (branch, queue, service, category) is compared against
 * that metric's mean for the same month. A value that is consistently worse across several
 * months is a systemic weak spot, not a bad month — that distinction is the whole reason
 * clustering earns its place next to the trend chart.
 */
export function buildClusters(history, { minMonths = 3 } = {}) {
  const byKey = new Map();

  for (const h of history) {
    const monthMean = new Map();
    for (const r of h.sla_results) if (r.actual != null) monthMean.set(r.id, r.actual);

    for (const b of h.breakdowns ?? []) {
      const metric = metricById(b.metricId);
      const base = monthMean.get(b.metricId);
      if (!metric || base == null || !base) continue;

      // Positive delta always means "worse than the metric's own average that month".
      const deltaPct = ((toWorse(metric, b.value) - toWorse(metric, base)) / Math.abs(base)) * 100;
      const id = `${b.metricId}::${b.dimension}::${b.key}`;
      if (!byKey.has(id)) {
        byKey.set(id, {
          metricId: b.metricId, metricName: metric.name, dimension: b.dimension, key: b.key,
          serviceCredit: !!metric.serviceCredit, unit: metric.unit, months: [],
        });
      }
      byKey.get(id).months.push({
        month: h.reporting_month, value: b.value, base, deltaPct: round(deltaPct, 1), records: b.records,
      });
    }
  }

  return [...byKey.values()]
    .map((c) => {
      const worseMonths = c.months.filter((m) => m.deltaPct > 5).length;
      const avgDelta = c.months.reduce((a, m) => a + m.deltaPct, 0) / c.months.length;
      const records = c.months.reduce((a, m) => a + m.records, 0);
      return {
        ...c,
        monthsPresent: c.months.length,
        monthsWorse: worseMonths,
        avgDeltaPct: round(avgDelta, 1),
        records,
        // Recurring = consistently worse, over enough months to rule out a one-off.
        recurring: worseMonths >= minMonths && avgDelta > 8,
        persistence: round(worseMonths / c.months.length, 2),
      };
    })
    .filter((c) => c.recurring)
    .sort((a, b) => b.avgDeltaPct * b.persistence - a.avgDeltaPct * a.persistence);
}

// ----------------------------------------------------------------- demand

/** Volume trend and next-month projection — the demand-forecasting story. */
export function buildDemand(history) {
  const series = (pick) =>
    history
      .map((h) => ({ month: h.reporting_month, label: monthLabel(h.reporting_month), value: pick(h.demand ?? {}) }))
      .filter((p) => p.value != null);

  const project = (points) => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const slope = slopeOf(values);
    const last = values[values.length - 1];
    const projected = Math.max(0, Math.round(last + slope));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
    return {
      points,
      current: last,
      projected,
      changePct: round(((projected - last) / (last || 1)) * 100, 1),
      vsAveragePct: round(((last - mean) / (mean || 1)) * 100, 1),
      peakMonth: peak.label,
      peakValue: peak.value,
    };
  };

  return {
    calls: project(series((d) => d.callsOffered)),
    complaints: project(series((d) => d.complaintsLogged)),
    escalations: project(series((d) => d.escalationsRaised)),
  };
}

// ------------------------------------------------------------ orchestration

/**
 * Full intelligence payload.
 * `scope` is either 'all' (the whole history) or a month key, which narrows the window to
 * that month and everything before it — so a past month is analysed with only the context
 * that existed at the time, rather than with hindsight.
 */
export function buildIntelligence({ scope = 'all' } = {}) {
  const full = loadHistory();
  const history = scope === 'all' ? full : full.filter((h) => h.reporting_month <= scope);

  if (!history.length) {
    return { scope, months: [], trends: [], risk: [], clusters: [], demand: {}, empty: true };
  }

  const trends = buildTrends(history);
  const risk = buildRisk(trends);
  const clusters = buildClusters(history);
  const demand = buildDemand(history);
  const latest = history[history.length - 1];

  return {
    scope,
    empty: false,
    generatedAt: new Date().toISOString(),
    months: history.map((h) => ({
      month: h.reporting_month,
      label: h.label,
      provenance: h.provenance ?? 'generated',
      summary: h.summary,
    })),
    focusMonth: latest.reporting_month,
    focusLabel: latest.label,
    horizonMonth: nextMonthKey(latest.reporting_month),
    horizonLabel: monthLabel(nextMonthKey(latest.reporting_month)),
    trends,
    risk,
    clusters,
    demand,
    headline: {
      // Metrics not breaching today but projected to breach next month — the number that
      // justifies the whole predictive layer.
      newlyAtRisk: risk.filter((r) => r.projectedBreach && !r.alreadyBreaching).length,
      atRiskNextMonth: risk.filter((r) => r.projectedBreach).length,
      currentBreaches: risk.filter((r) => r.alreadyBreaching).length,
      deteriorating: trends.filter((t) => t.direction_label === 'deteriorating' && t.observations > 1).length,
      improving: trends.filter((t) => t.direction_label === 'improving' && t.observations > 1).length,
      stable: trends.filter((t) => t.direction_label === 'stable' && t.observations > 1).length,
      recurringCauses: clusters.length,
      monthsAnalysed: history.length,
    },
  };
}
