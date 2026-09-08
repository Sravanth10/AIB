import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import TrendChart from '../components/TrendChart.jsx';
import { Rag, CreditTag } from '../components/Chips.jsx';
import { IconSpark, IconAlert, IconLayers, IconCircleCheck, IconClock } from '../components/Icons.jsx';
import { fmtValue, fmtTarget } from '../lib/format.js';

const BRIEF =
  'AI-powered trend analysis, breach prediction and root-cause clustering across your full SLA history.';

const scoreStyle = (score) =>
  score >= 70
    ? { background: 'var(--red-bg)', color: 'var(--red)' }
    : score >= 40
      ? { background: 'var(--papaya)', color: '#c9741a' }
      : { background: 'var(--violet-050)', color: 'var(--violet-700)' };

export default function Intelligence({ open, onClose }) {
  const [scope, setScope] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [metricId, setMetricId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.intelligence(scope)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Default the chart to whatever the risk panel considers most urgent.
        setMetricId((cur) => (cur && d.trends.some((t) => t.id === cur) ? cur : d.risk?.[0]?.id ?? d.trends?.[0]?.id ?? null));
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, scope]);

  // Escape closes the panel — expected of anything that behaves like a drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const trend = useMemo(() => data?.trends.find((t) => t.id === metricId) ?? null, [data, metricId]);

  return (
    <>
      <div className={`intel-scrim${open ? ' is-open' : ''}`} onClick={onClose} />
      <section className={`intel-panel${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <header className="intel-header">
          <button className="intel-back" onClick={onClose} title="Back to governance (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 6l6 6-6 6M20 12H4" />
            </svg>
            Governance
          </button>

          {open && (
            <>
              <div className="intel-badge">
                <IconSpark size={17} />
                <span className="intel-badge-title">Operational Intelligence</span>
              </div>
              <p className="intel-brief">{BRIEF}</p>
            </>
          )}
        </header>

        <div className="intel-body">
          {/* -------------------------------------------------- scope toggle */}
          {data && !data.empty && (
            <div className="scope-bar">
              <button className={`scope-chip${scope === 'all' ? ' is-active' : ''}`} onClick={() => setScope('all')}>
                All history
              </button>
              {data.months.map((m) => (
                <button key={m.month}
                        className={`scope-chip${scope === m.month ? ' is-active' : ''}`}
                        onClick={() => setScope(m.month)}>
                  {m.label.replace(' 20', " '")}
                </button>
              ))}
            </div>
          )}

          {loading && !data && <div className="empty" style={{ paddingTop: 60 }}><span className="spinner" /></div>}
          {error && (
            <div className="card empty">
              <div className="empty-icon"><IconAlert size={26} /></div>
              <h3>Could not build the intelligence view</h3>
              <p>{error}</p>
            </div>
          )}

          {data?.empty && (
            <div className="card empty">
              <div className="empty-icon"><IconLayers size={26} /></div>
              <h3>No history to analyse yet</h3>
              <p>Generate at least two monthly governance packs and the trend, risk and pattern panels will populate.</p>
            </div>
          )}

          {data && !data.empty && (
            <>
              {/* ------------------------------------------------- headline */}
              <div className="stat-row">
                <Stat label="Periods analysed" value={data.headline.monthsAnalysed} note={`${data.months[0].label} to ${data.focusLabel}`} accent="violet" />
                <Stat label={`Projected to breach in ${data.horizonLabel}`} value={data.headline.atRiskNextMonth}
                      note={`${data.headline.newlyAtRisk} not breaching today`} accent="red" />
                <Stat label="Deteriorating" value={data.headline.deteriorating} note={`${data.headline.stable} holding steady`} accent="amber" />
                <Stat label="Recurring causes" value={data.headline.recurringCauses} note="consistent across months" accent="violet" />
              </div>

              {/* ------------------------------------------------ narrative */}
              {data.narrative && (
                <div className="narrative-card">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="row" style={{ gap: 9 }}>
                      <IconSpark />
                      <h2>Executive insight</h2>
                    </div>
                    <span className="narrative-meta">{scope === 'all' ? 'All history' : data.focusLabel}</span>
                  </div>
                  <div className="narrative-text">
                    {data.narrative.text.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
                  </div>
                  <span className="narrative-source">
                    {data.narrative.source === 'bedrock'
                      ? `Generated by ${data.narrative.model} via Amazon Bedrock`
                      : 'Composed from the computed trend, risk and cluster outputs'}
                    {data.narrative.cached ? ' · cached' : ''}
                  </span>
                </div>
              )}

              <div className="intel-grid">
                {/* ---------------------------------------------- trend */}
                <div className="card">
                  <div className="card-head">
                    <div className="trend-head" style={{ width: '100%' }}>
                      <div>
                        <h2>Multi-month trend</h2>
                        <div className="sub">
                          {trend
                            ? `${trend.direction_label} · ${trend.observations} periods · target ${fmtTarget(trend)}`
                            : 'Select a metric'}
                        </div>
                      </div>
                      <select className="metric-select" value={metricId ?? ''} onChange={(e) => setMetricId(e.target.value)}>
                        {data.trends.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="chart-wrap">
                    {trend ? <TrendChart trend={trend} /> : <p className="tiny muted">No metric selected.</p>}
                  </div>
                </div>

                {/* ----------------------------------------------- risk */}
                <div className="card">
                  <div className="card-head">
                    <div>
                      <h2>Breach risk · {data.horizonLabel}</h2>
                      <div className="sub">Ranked by trend slope and distance to threshold</div>
                    </div>
                  </div>
                  <div className="card-pad">
                    {data.risk.slice(0, 6).map((r) => (
                      <div key={r.id} className={`risk-row${r.serviceCredit && r.projectedBreach ? ' is-credit' : ''}`}
                           onClick={() => setMetricId(r.id)} style={{ cursor: 'pointer' }}>
                        <div className="risk-score" style={scoreStyle(r.score)}>{r.score}</div>
                        <div>
                          <div className="row" style={{ gap: 7 }}>
                            <span className="risk-name">{r.name}</span>
                            {r.serviceCredit && r.projectedBreach && <CreditTag />}
                          </div>
                          <div className="risk-why">{r.reasons.join(' · ')}</div>
                        </div>
                        <div className="risk-figures">
                          <div className="risk-projection">
                            {fmtValue(r.current, r.unit)}
                            <span className="risk-arrow">→</span>
                            <span style={{ color: r.projectedBreach ? 'var(--red)' : 'var(--ink)' }}>
                              {fmtValue(r.projected, r.unit)}
                            </span>
                          </div>
                          <div style={{ marginTop: 5 }}><Rag status={r.projectedRag} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ------------------------------------------- root causes */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Recurring failure points</h2>
                    <div className="sub">
                      Drivers consistently worse than their metric's own average — a systemic weak spot, not a bad month
                    </div>
                  </div>
                  <span className="tag warm">{data.clusters.length} found</span>
                </div>
                <div className="card-pad">
                  {data.clusters.length === 0 ? (
                    <div className="row" style={{ gap: 10, color: 'var(--green)' }}>
                      <IconCircleCheck size={18} />
                      <span className="tiny" style={{ color: 'var(--ink-2)' }}>
                        No driver is consistently worse than its metric average across the window.
                      </span>
                    </div>
                  ) : (
                    data.clusters.slice(0, 6).map((c) => (
                      <div key={`${c.metricId}-${c.dimension}-${c.key}`} className="cluster-row">
                        <div>
                          <div className="row" style={{ gap: 8 }}>
                            <span className="cluster-driver">{c.key}</span>
                            <span className="tag muted">{c.dimension}</span>
                            {c.serviceCredit && <CreditTag />}
                          </div>
                          <div className="cluster-meta">
                            {c.metricName} · {c.records.toLocaleString()} records across {c.monthsPresent} periods
                          </div>
                          <div className="months-strip" title={`Worse than average in ${c.monthsWorse} of ${c.monthsPresent} periods`}>
                            {c.months.map((m) => (
                              <i key={m.month} className={m.deltaPct > 5 ? 'hit' : ''} />
                            ))}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="cluster-delta">+{c.avgDeltaPct}%</div>
                          <div className="cluster-persist">worse than average</div>
                          <div className="cluster-persist">{c.monthsWorse} of {c.monthsPresent} periods</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ----------------------------------------------- demand */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Demand forecast · {data.horizonLabel}</h2>
                    <div className="sub">Projected volume from the observed trend, for capacity planning</div>
                  </div>
                </div>
                <div className="card-pad">
                  <div className="demand-row">
                    <Demand label="Calls offered" d={data.demand.calls} />
                    <Demand label="Complaints logged" d={data.demand.complaints} />
                    <Demand label="Escalations raised" d={data.demand.escalations} />
                  </div>
                </div>
              </div>

              <div className="row" style={{ justifyContent: 'center', paddingTop: 4 }}>
                <span className="tiny muted row" style={{ gap: 7 }}>
                  <IconClock />
                  Trend, risk and clustering computed from {data.headline.monthsAnalysed} stored governance packs ·
                  every figure derived by rule, not inferred
                </span>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, note, accent }) {
  return (
    <div className={`stat accent-${accent}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

function Demand({ label, d }) {
  if (!d) return null;
  const up = d.changePct > 0;
  return (
    <div className="demand-card">
      <div className="demand-label">{label}</div>
      <div className="demand-value">{d.projected.toLocaleString()}</div>
      <div className={`demand-change ${up ? 'up' : 'down'}`}>
        {up ? '▲' : '▼'} {Math.abs(d.changePct)}% vs {d.current.toLocaleString()}
      </div>
      <div className="demand-note">Peak so far: {d.peakMonth}</div>
    </div>
  );
}
