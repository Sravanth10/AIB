import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { metrics: METRICS } = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'sla-metrics.json'), 'utf8'));

export const SLA_METRICS = METRICS.filter((m) => m.id);
export const metricById = (id) => SLA_METRICS.find((m) => m.id === id);

/**
 * The whole RAG rule, in one place.
 *
 *   GREEN  meets the target
 *   AMBER  misses it but sits inside the metric's own absolute tolerance
 *   RED    beyond that - a breach
 *
 * Tolerance is absolute rather than a percentage of target: a 10% band around a 99.5%
 * uptime target would stretch to 89.5%, which is meaningless.
 */
export function ragFor(metric, actual) {
  if (actual == null || Number.isNaN(actual)) return 'NO_DATA';
  const { target, amberTolerance = 0, direction } = metric;
  if (direction === 'lower_is_better') {
    if (actual <= target) return 'GREEN';
    return actual <= target + amberTolerance ? 'AMBER' : 'RED';
  }
  if (actual >= target) return 'GREEN';
  return actual >= target - amberTolerance ? 'AMBER' : 'RED';
}

/** Signed distance from target, in the metric's own unit. Negative = the wrong side. */
export function varianceOf(metric, actual) {
  if (actual == null) return null;
  const raw = metric.direction === 'lower_is_better' ? metric.target - actual : actual - metric.target;
  return Math.round(raw * 100) / 100;
}

/**
 * Score all 15 metrics against whatever values the adapters produced.
 * Metrics with no contributing source come back as NO_DATA rather than being dropped -
 * an absent metric is a governance finding, not an empty row.
 */
export function buildResults(valuesById) {
  return SLA_METRICS.map((metric) => {
    const found = valuesById[metric.id];
    const actual = found?.value ?? null;
    const rag = ragFor(metric, actual);
    return {
      id: metric.id,
      name: metric.name,
      source: metric.source,
      unit: metric.unit,
      target: metric.target,
      direction: metric.direction,
      amberTolerance: metric.amberTolerance,
      serviceCredit: !!metric.serviceCredit,
      actual,
      rag,
      breach: rag === 'RED',
      variance: varianceOf(metric, actual),
      sampleSize: found?.sampleSize ?? null,
      sourceFile: found?.sourceFile ?? null,
      sourceId: found?.sourceId ?? null,
    };
  });
}

export function summarise(results) {
  const counts = { GREEN: 0, AMBER: 0, RED: 0, NO_DATA: 0 };
  for (const r of results) counts[r.rag]++;
  const breaches = results.filter((r) => r.breach);
  return {
    ...counts,
    total: results.length,
    scored: results.length - counts.NO_DATA,
    breaches: breaches.length,
    serviceCreditBreaches: breaches.filter((r) => r.serviceCredit).length,
    serviceCreditAtRisk: breaches.filter((r) => r.serviceCredit).map((r) => r.id),
  };
}
