import { fmtValue } from '../lib/format.js';

const RAG_COLOUR = { GREEN: '#2e9e7b', AMBER: '#e59a3c', RED: '#dc4c64', NO_DATA: '#9a94be' };

/**
 * Multi-month trajectory for one SLA, drawn as inline SVG.
 *
 * The target line and the amber tolerance band are drawn as shaded regions rather than
 * annotations, so "how close are we to breaching" is legible without reading any numbers —
 * the line entering the band IS the finding.
 */
export default function TrendChart({ trend, height = 210 }) {
  const points = trend.points.filter((p) => p.value != null);
  if (points.length < 2) {
    return <div className="empty" style={{ padding: 40 }}><p>Not enough history to chart this metric yet.</p></div>;
  }

  const W = 720;
  const H = height;
  const pad = { top: 18, right: 18, bottom: 30, left: 52 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const lower = trend.direction === 'lower_is_better';
  const breachLine = lower ? trend.target + trend.amberTolerance : trend.target - trend.amberTolerance;

  // Include target and breach line in the extent so the bands are always visible.
  const values = [...points.map((p) => p.value), trend.target, breachLine];
  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = max - min || Math.abs(max) * 0.1 || 1;
  min -= span * 0.18;
  max += span * 0.18;

  const x = (i) => pad.left + (i / (points.length - 1)) * innerW;
  const y = (v) => pad.top + (1 - (v - min) / (max - min)) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${pad.top + innerH} L ${x(0)} ${pad.top + innerH} Z`;

  // Green region runs from the target away from the breach line; amber sits between
  // target and breach line; red is beyond.
  const yTarget = y(trend.target);
  const yBreach = y(breachLine);
  const amberTop = Math.min(yTarget, yBreach);
  const amberH = Math.abs(yBreach - yTarget);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`${trend.name} across ${points.length} months`}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9381ff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#9381ff" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* breach region — beyond the amber band */}
        <rect
          x={pad.left} width={innerW}
          y={lower ? pad.top : yBreach}
          height={Math.max(0, lower ? yBreach - pad.top : pad.top + innerH - yBreach)}
          fill="#dc4c64" opacity="0.07"
        />
        {/* amber tolerance band */}
        <rect x={pad.left} y={amberTop} width={innerW} height={amberH} fill="#ffd8be" opacity="0.5" />

        {/* target line */}
        <line x1={pad.left} x2={pad.left + innerW} y1={yTarget} y2={yTarget}
              stroke="#2e9e7b" strokeWidth="1.4" strokeDasharray="5 4" />
        <text x={pad.left - 8} y={yTarget + 3.5} textAnchor="end" fontSize="9.5" fill="#2e9e7b" fontWeight="600">
          {fmtValue(trend.target, trend.unit)}
        </text>

        {/* axis */}
        <line x1={pad.left} x2={pad.left + innerW} y1={pad.top + innerH} y2={pad.top + innerH}
              stroke="#e8e5f8" strokeWidth="1" />

        <path d={area} fill="url(#trendFill)" />
        <path d={line} fill="none" stroke="#6e5be0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <g key={p.month}>
            <circle cx={x(i)} cy={y(p.value)} r="5.5" fill="#fff" stroke={RAG_COLOUR[p.rag]} strokeWidth="2.6" />
            <text x={x(i)} y={pad.top + innerH + 17} textAnchor="middle" fontSize="9.5" fill="#7b74a3">
              {p.label.split(' ')[0].slice(0, 3)}
            </text>
            <text x={x(i)} y={y(p.value) - 12} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#241d47">
              {fmtValue(p.value, trend.unit)}
            </text>
          </g>
        ))}
      </svg>

      <div className="chart-legend">
        <span><i style={{ background: '#6e5be0' }} />Actual</span>
        <span><i style={{ background: '#2e9e7b' }} />Target {fmtValue(trend.target, trend.unit)}</span>
        <span><i className="band" style={{ background: '#ffd8be' }} />Tolerance band</span>
        <span><i className="band" style={{ background: 'rgba(220,76,100,0.14)' }} />Breach</span>
      </div>
    </div>
  );
}
