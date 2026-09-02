import { SLA_METRICS } from './slaEngine.js';
import { SOURCE_TEMPLATES } from './classify.js';

/**
 * Data-quality flagging.
 *
 * These are governance findings, not errors - the point of the view is that gaps in the
 * evidence are stated openly rather than papered over with a plausible-looking number.
 */

const STALE_AFTER_DAYS = 7;

const monthEnd = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0));
};
const monthStart = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};

export function assessQuality({ monthKey, sources, results }) {
  const flags = [];
  const add = (f) => flags.push({ id: `${f.type}:${f.metric ?? f.sourceId ?? flags.length}`, ...f });

  const presentSources = new Set(sources.map((s) => s.sourceId));

  // 1. Whole sources that never arrived.
  for (const tpl of SOURCE_TEMPLATES) {
    if (presentSources.has(tpl.id)) continue;
    const affected = SLA_METRICS.filter((m) => m.source === tpl.metricSource).map((m) => m.id);
    add({
      type: 'missing_source',
      severity: affected.some((id) => SLA_METRICS.find((m) => m.id === id)?.serviceCredit) ? 'red' : 'amber',
      sourceId: tpl.id,
      title: `${tpl.label} not received`,
      detail: `No ${tpl.label.toLowerCase()} has been uploaded for this period. ${affected.length} metric${affected.length === 1 ? '' : 's'} cannot be scored.`,
      affectedMetrics: affected,
    });
  }

  // 2. Metrics with no value, where the source DID arrive - i.e. the data itself is missing.
  for (const r of results) {
    if (r.rag !== 'NO_DATA') continue;
    const tpl = SOURCE_TEMPLATES.find((t) => t.metricSource === r.source);
    if (tpl && !presentSources.has(tpl.id)) continue; // already reported as a missing source
    add({
      type: 'missing_metric',
      severity: r.serviceCredit ? 'red' : 'amber',
      metric: r.id,
      title: `${r.name} — no source data`,
      detail: `The ${r.source} file was received but carries no column or record set for this metric. Reported as unscored rather than estimated.`,
      affectedMetrics: [r.id],
    });
  }

  // 3. Coverage that stops well short of the period end.
  const end = monthEnd(monthKey);
  const start = monthStart(monthKey);
  for (const s of sources) {
    if (!s.coverage?.end) continue;
    const last = new Date(`${s.coverage.end}T00:00:00Z`);
    const gapDays = Math.round((end - last) / 86400000);
    if (gapDays > STALE_AFTER_DAYS) {
      add({
        type: 'stale_data',
        severity: 'amber',
        sourceId: s.sourceId,
        title: `${s.sourceLabel} data stops ${gapDays} days before period end`,
        detail: `Latest record is ${s.coverage.end}; the reporting period ends ${end.toISOString().slice(0, 10)}. Metrics from this source cover a partial month.`,
        affectedMetrics: Object.keys(s.metrics ?? {}),
      });
    }
    const first = new Date(`${s.coverage.start}T00:00:00Z`);
    if (first < start || last > end) {
      add({
        type: 'coverage_outside_period',
        severity: 'amber',
        sourceId: s.sourceId,
        title: `${s.sourceLabel} contains records outside the period`,
        detail: `Coverage runs ${s.coverage.start} to ${s.coverage.end}, which extends beyond ${monthKey}.`,
        affectedMetrics: [],
      });
    }
  }

  // 4. A file whose own content says it belongs to a different month.
  for (const s of sources) {
    if (s.detectedMonth && s.detectedMonth !== monthKey) {
      add({
        type: 'month_mismatch',
        severity: 'red',
        sourceId: s.sourceId,
        title: `${s.sourceLabel} appears to be ${s.detectedMonth} data`,
        detail: `The file's own reporting period reads ${s.detectedMonth}, but it has been filed under ${monthKey}.`,
        affectedMetrics: Object.keys(s.metrics ?? {}),
      });
    }
  }

  // 5. Defects the adapters found inside the records themselves.
  for (const s of sources) {
    const st = s.stats ?? {};
    if (st.duplicateRefs?.length) {
      add({
        type: 'duplicate_reference',
        severity: 'amber',
        sourceId: s.sourceId,
        title: `Duplicate reference in ${s.sourceLabel}`,
        detail: `${st.duplicateRefs.join(', ')} appears more than once. Case counts from this file may be overstated.`,
        affectedMetrics: Object.keys(s.metrics ?? {}),
      });
    }
    if (st.open > 0) {
      add({
        type: 'unresolved_items',
        severity: 'info',
        sourceId: s.sourceId,
        title: `${st.open} case${st.open === 1 ? '' : 's'} still open in ${s.sourceLabel}`,
        detail: `Open cases are excluded from the resolution-time average, so the reported figure reflects closed cases only.`,
        affectedMetrics: Object.keys(s.metrics ?? {}),
      });
    }
    if (st.looseDates > 0) {
      add({
        type: 'inconsistent_formatting',
        severity: 'info',
        sourceId: s.sourceId,
        title: `Mixed date formats in ${s.sourceLabel}`,
        detail: `${st.looseDates} date${st.looseDates === 1 ? ' was' : 's were'} entered as free text rather than dates. Parsed successfully, but the file is hand-maintained.`,
        affectedMetrics: [],
      });
    }
    if (st.unparseableDates > 0) {
      add({
        type: 'unparseable_dates',
        severity: 'amber',
        sourceId: s.sourceId,
        title: `${st.unparseableDates} unreadable date${st.unparseableDates === 1 ? '' : 's'} in ${s.sourceLabel}`,
        detail: `These rows were kept but contribute no date evidence to coverage checks.`,
        affectedMetrics: [],
      });
    }
    if (s.error) {
      add({
        type: 'adapter_error',
        severity: 'red',
        sourceId: s.sourceId,
        title: `Could not read ${s.sourceLabel}`,
        detail: s.error,
        affectedMetrics: [],
      });
    }
  }

  const order = { red: 0, amber: 1, info: 2 };
  flags.sort((a, b) => order[a.severity] - order[b.severity]);
  return flags;
}

export function qualitySummary(flags) {
  return {
    total: flags.length,
    red: flags.filter((f) => f.severity === 'red').length,
    amber: flags.filter((f) => f.severity === 'amber').length,
    info: flags.filter((f) => f.severity === 'info').length,
  };
}
