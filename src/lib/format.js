export function fmtValue(value, unit) {
  if (value == null) return '—';
  const dp = unit === '%' ? 2 : unit === 'seconds' ? 0 : 1;
  const n = Number(value).toFixed(dp);
  if (unit === '%') return `${n}%`;
  if (unit === 'seconds') return `${n}s`;
  if (unit === 'days') return `${n}d`;
  return n;
}

export const fmtTarget = (m) => `${m.direction === 'lower_is_better' ? '≤' : '≥'} ${fmtValue(m.target, m.unit)}`;

/** Tolerances are small and exact — rounding 0.25d to "0.3d" misstates the contract. */
export function fmtTolerance(metric) {
  const v = metric.amberTolerance;
  if (v == null) return '—';
  const n = Number(v).toString();
  return metric.unit === '%' ? `${n}%` : metric.unit === 'seconds' ? `${n}s` : metric.unit === 'days' ? `${n}d` : n;
}

export function fmtVariance(metric, variance) {
  if (variance == null) return '—';
  const sign = variance >= 0 ? '+' : '−';
  return `${sign}${fmtValue(Math.abs(variance), metric.unit)}`;
}

// Structural evidence is matched in normalised lowercase; show it the way the column or
// term actually reads in the source document.
const ACRONYMS = new Set(['tat', 'qa', 'asa', 'aht', 'fcr', 'arn', 'aws', 'stp', 'uw', 'sla', 'fspo', 'id']);

export function fmtEvidence(token) {
  return String(token)
    .split(' ')
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function fmtStamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString('en-IE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function relativeTime(iso) {
  if (!iso) return null;
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} hr ago`;
  return `${Math.round(secs / 86400)} d ago`;
}

/** How far along the target→breach axis a value sits, for the inline bars. 0..1 */
export function progressOf(metric, actual) {
  if (actual == null) return 0;
  const span = Math.max(metric.amberTolerance * 4, Math.abs(metric.target) * 0.1);
  const delta = metric.direction === 'lower_is_better' ? actual - metric.target : metric.target - actual;
  return Math.max(0, Math.min(1, 0.5 + delta / (span * 2)));
}
