import Logo from '../components/Logo.jsx';
import { SourceChip, Rag, CreditTag } from '../components/Chips.jsx';
import { IconDownload, IconAlert, IconInfo } from '../components/Icons.jsx';
import { fmtValue, fmtTarget, fmtVariance, fmtStamp, fmtBytes } from '../lib/format.js';

/**
 * The governance pack. Rendered as a document rather than a dashboard, and styled for print,
 * so "export" is the browser's own PDF engine — real page breaks, vector text, selectable
 * content — instead of a screenshot wrapped in a PDF.
 */
export default function Pack({ analysis, sourceIdFor, metricName }) {
  const { sla_results: results, summary, data_quality_flags: flags, source_files: sources, quality_summary: qs } = analysis;
  const breaches = results.filter((r) => r.rag === 'RED');
  const creditBreaches = breaches.filter((r) => r.serviceCredit);

  return (
    <div className="card pack-page" style={{ padding: '34px 38px' }}>
      <div className="row no-print" style={{ justifyContent: 'flex-end', marginBottom: 18 }}>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          <IconDownload /> Export as PDF
        </button>
      </div>

      {/* ---------------------------------------------------------- masthead */}
      <div style={{ borderBottom: '2px solid var(--violet)', paddingBottom: 16, marginBottom: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <Logo height={34} plate={false} />
            <div style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--violet-700)', fontWeight: 700, marginTop: 12 }}>
              Service Governance
            </div>
            <h1 style={{ fontSize: 25, marginTop: 7 }}>Monthly SLA Governance Pack</h1>
            <div className="muted" style={{ fontSize: 13, marginTop: 5 }}>
              Reporting period: <b style={{ color: 'var(--ink)' }}>{analysis.label}</b>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.7 }}>
            <div>Generated <b style={{ color: 'var(--ink)' }}>{fmtStamp(analysis.generated_at)}</b></div>
            <div>{sources.length} source file{sources.length === 1 ? '' : 's'} · {summary.scored} of {summary.total} metrics scored</div>
            <div>Prepared automatically · supersedes prior runs for this period</div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- executive summary */}
      <Section title="1. Executive summary">
        <p style={{ fontSize: 13, lineHeight: 1.72, color: 'var(--ink-2)' }}>
          Of the {summary.total} contracted service levels for {analysis.label}, <b>{summary.GREEN}</b> met target,{' '}
          <b>{summary.AMBER}</b> sat inside tolerance but missed target, and <b>{summary.breaches}</b> breached.{' '}
          {creditBreaches.length > 0 ? (
            <>
              <b style={{ color: 'var(--red)' }}>{creditBreaches.length} breach{creditBreaches.length === 1 ? '' : 'es'} carr{creditBreaches.length === 1 ? 'ies' : 'y'} a
              service-credit consequence</b> and {creditBreaches.length === 1 ? 'is' : 'are'} set out in section 3.
            </>
          ) : (
            <>No breach in this period carries a service-credit consequence.</>
          )}{' '}
          {summary.NO_DATA > 0 && (
            <>
              {summary.NO_DATA} metric{summary.NO_DATA === 1 ? '' : 's'} could not be scored because the underlying
              evidence was not supplied; {summary.NO_DATA === 1 ? 'it is' : 'these are'} reported as {' '}
              a gap rather than estimated. </>
          )}
          {qs.red + qs.amber > 0 && <>{qs.red + qs.amber} data-quality {qs.red + qs.amber === 1 ? 'issue' : 'issues'} affect the evidence base and are listed in section 4.</>}
        </p>

        <div className="stat-row" style={{ marginTop: 16 }}>
          <Tile label="On target" value={summary.GREEN} colour="var(--green)" />
          <Tile label="At risk" value={summary.AMBER} colour="#c9741a" />
          <Tile label="Breaches" value={summary.breaches} colour="var(--red)" />
          <Tile label="Service credit" value={summary.serviceCreditBreaches} colour="var(--red)" />
          <Tile label="Unscored" value={summary.NO_DATA} colour="var(--nodata)" />
        </div>
      </Section>

      {/* --------------------------------------------------- full sla position */}
      <Section title="2. Service level position — all 15 metrics">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th><th>Source</th><th className="num">Target</th>
                <th className="num">Actual</th><th className="num">Variance</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className={r.rag === 'RED' ? 'row-red' : undefined}>
                  <td>
                    <div className="metric-name">{r.name}</div>
                    {r.serviceCredit && <div className="metric-sub">service-credit linked</div>}
                  </td>
                  <td className="tiny muted">{r.source}</td>
                  <td className="num muted">{fmtTarget(r)}</td>
                  <td className="num">{fmtValue(r.actual, r.unit)}</td>
                  <td className="num" style={{ color: r.variance != null && r.variance < 0 ? 'var(--red)' : 'var(--ink-3)' }}>
                    {fmtVariance(r, r.variance)}
                  </td>
                  <td><Rag status={r.rag} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ------------------------------------------------------- exceptions */}
      <Section title="3. Exceptions and service-credit exposure">
        {breaches.length === 0 ? (
          <p className="tiny muted">No service level breached its threshold in this period.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Breached metric</th><th className="num">Target</th><th className="num">Actual</th><th className="num">Variance</th><th>Consequence</th></tr>
            </thead>
            <tbody>
              {[...breaches].sort((a, b) => Number(b.serviceCredit) - Number(a.serviceCredit)).map((r) => (
                <tr key={r.id}>
                  <td className="metric-name">{r.name}</td>
                  <td className="num muted">{fmtTarget(r)}</td>
                  <td className="num" style={{ color: 'var(--red)' }}>{fmtValue(r.actual, r.unit)}</td>
                  <td className="num" style={{ color: 'var(--red)' }}>{fmtVariance(r, r.variance)}</td>
                  <td>{r.serviceCredit ? <CreditTag /> : <span className="tiny muted">Reportable — no credit</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ---------------------------------------------------- data quality */}
      <Section title="4. Data quality and evidence gaps">
        {flags.length === 0 ? (
          <p className="tiny muted">No data-quality issues were detected in the evidence supplied.</p>
        ) : (
          flags.map((f) => (
            <div key={f.id} className={`flag sev-${f.severity}`}>
              <div className="flag-icon">{f.severity === 'info' ? <IconInfo /> : <IconAlert />}</div>
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
          ))
        )}
      </Section>

      {/* ------------------------------------------------- evidence appendix */}
      <Section title="5. Evidence — source files used">
        <table className="table">
          <thead>
            <tr><th>File as received</th><th>Identified as</th><th className="num">Confidence</th><th>Verification</th><th>Coverage</th></tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.uploadId}>
                <td>
                  <div className="file-name" style={{ maxWidth: 260 }}>{s.filename}</div>
                  <div className="metric-sub">{fmtBytes(s.bytes)} · {s.metricCount} metric{s.metricCount === 1 ? '' : 's'} contributed</div>
                </td>
                <td><SourceChip sourceId={sourceIdFor({ source: s.sourceLabel })} label={s.sourceLabel} /></td>
                <td className="num">{Math.round((s.confidence ?? 0) * 100)}%</td>
                <td className="tiny muted">
                  {s.confirmedBy === 'user-corrected' ? 'Corrected by reviewer'
                    : s.confirmedBy === 'user-confirmed' ? 'Confirmed by reviewer'
                    : 'Auto-classified, unreviewed'}
                </td>
                <td className="tiny muted">{s.coverage ? `${s.coverage.start} → ${s.coverage.end}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tiny muted" style={{ marginTop: 14, lineHeight: 1.6 }}>
          Source type was determined from each file's internal structure and content. Filenames were not used
          as evidence. All service level figures are calculated by deterministic rules from the records in these
          files; no figure in this pack is model-generated.
        </p>
      </Section>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 26, paddingTop: 14, fontSize: 10.5, color: 'var(--ink-4)', lineHeight: 1.6 }}>
        AIB Life · SLA Governance Pack · {analysis.label} · generated {fmtStamp(analysis.generated_at)}.
        This pack replaces any previously generated version for this reporting period.
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 26, breakInside: 'avoid' }}>
      <h2 style={{ fontSize: 14, marginBottom: 12, color: 'var(--violet-700)' }}>{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value, colour }) {
  return (
    <div className="stat" style={{ padding: '13px 15px' }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: colour, fontSize: 23 }}>{value}</div>
    </div>
  );
}
