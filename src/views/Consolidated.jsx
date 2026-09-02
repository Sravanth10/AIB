import { SourceChip, Rag, CreditTag } from '../components/Chips.jsx';
import { IconAlert, IconInfo, IconCircleCheck } from '../components/Icons.jsx';
import { fmtValue, fmtTarget, fmtVariance, progressOf } from '../lib/format.js';

const SEV_ICON = { red: <IconAlert />, amber: <IconAlert />, info: <IconInfo /> };

const RAG_COLOUR = { GREEN: 'var(--green)', AMBER: '#e59a3c', RED: 'var(--red)', NO_DATA: 'var(--nodata)' };

export function MetricTable({ results, sourceIdFor }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '30%' }}>Metric</th>
            <th>Source</th>
            <th className="num">Target</th>
            <th className="num">Actual</th>
            <th className="num">Variance</th>
            <th style={{ width: 110 }}>Position</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id} className={r.rag === 'RED' ? 'row-red' : r.rag === 'NO_DATA' ? 'row-nodata' : undefined}>
              <td>
                <div className="metric-name">{r.name}</div>
                <div className="metric-sub">
                  {r.sampleSize ? `${r.sampleSize.toLocaleString()} records` : 'no contributing records'}
                  {r.serviceCredit && ' · service-credit linked'}
                </div>
              </td>
              <td>
                <SourceChip sourceId={sourceIdFor(r)} label={r.source} />
              </td>
              <td className="num muted">{fmtTarget(r)}</td>
              <td className="num" style={{ color: RAG_COLOUR[r.rag], fontSize: 14 }}>{fmtValue(r.actual, r.unit)}</td>
              <td className="num" style={{ color: r.variance != null && r.variance < 0 ? 'var(--red)' : 'var(--ink-3)' }}>
                {fmtVariance(r, r.variance)}
              </td>
              <td>
                {r.actual == null ? (
                  <span className="tiny muted">—</span>
                ) : (
                  <div className="bar">
                    <span style={{ width: `${progressOf(r, r.actual) * 100}%`, background: RAG_COLOUR[r.rag] }} />
                    <i className="mark" style={{ left: '50%' }} />
                  </div>
                )}
              </td>
              <td>
                <div className="row" style={{ gap: 6 }}>
                  <Rag status={r.rag} />
                  {r.breach && r.serviceCredit && <CreditTag />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QualityPanel({ flags, metricName }) {
  if (!flags.length) {
    return (
      <div className="card-pad row" style={{ gap: 10, color: 'var(--green)' }}>
        <IconCircleCheck size={18} />
        <span className="tiny" style={{ color: 'var(--ink-2)' }}>No data-quality issues detected in this period's evidence.</span>
      </div>
    );
  }
  return (
    <div className="card-pad">
      {flags.map((f) => (
        <div key={f.id} className={`flag sev-${f.severity}`}>
          <div className="flag-icon">{SEV_ICON[f.severity]}</div>
          <div>
            <div className="flag-title">{f.title}</div>
            <div className="flag-detail">{f.detail}</div>
            {f.affectedMetrics?.length > 0 && (
              <div className="flag-metrics">
                {f.affectedMetrics.map((id) => <span key={id} className="tag muted">{metricName(id)}</span>)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Consolidated({ analysis, sourceIdFor, metricName }) {
  const { sla_results: results, summary, data_quality_flags: flags, source_files: sources, quality_summary: qs } = analysis;

  return (
    <>
      <div className="stat-row">
        <div className="stat accent-violet">
          <div className="stat-label">Metrics scored</div>
          <div className="stat-value">{summary.scored}<span style={{ fontSize: 15, color: 'var(--ink-4)' }}> / {summary.total}</span></div>
          <div className="stat-note">{summary.NO_DATA} unscored — reported as evidence gaps</div>
        </div>
        <div className="stat accent-green">
          <div className="stat-label">On target</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{summary.GREEN}</div>
          <div className="stat-note">meeting the contracted threshold</div>
        </div>
        <div className="stat accent-amber">
          <div className="stat-label">At risk</div>
          <div className="stat-value" style={{ color: '#c9741a' }}>{summary.AMBER}</div>
          <div className="stat-note">inside tolerance, trending the wrong way</div>
        </div>
        <div className="stat accent-red">
          <div className="stat-label">Breaches</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{summary.breaches}</div>
          <div className="stat-note">{summary.serviceCreditBreaches} service-credit linked</div>
        </div>
        <div className="stat accent-amber">
          <div className="stat-label">Data quality</div>
          <div className="stat-value">{qs.total}</div>
          <div className="stat-note">{qs.red} critical · {qs.amber} warning · {qs.info} note</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Consolidated SLA position</h2>
            <div className="sub">
              All 15 metrics merged from {sources.length} source file{sources.length === 1 ? '' : 's'}, source-tagged and scored against contracted thresholds
            </div>
          </div>
        </div>
        <MetricTable results={results} sourceIdFor={sourceIdFor} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Data quality</h2>
            <div className="sub">Gaps, staleness and inconsistencies stated openly rather than estimated over</div>
          </div>
        </div>
        <QualityPanel flags={flags} metricName={metricName} />
      </div>
    </>
  );
}
