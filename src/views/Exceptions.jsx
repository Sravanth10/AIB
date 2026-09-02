import { SourceChip, Rag, CreditTag } from '../components/Chips.jsx';
import { IconShield, IconCircleCheck, IconSpark } from '../components/Icons.jsx';
import { fmtValue, fmtTarget, fmtVariance, fmtTolerance } from '../lib/format.js';

function ExceptionRow({ r, sourceIdFor }) {
  return (
    <div className={`exception-card${r.serviceCredit ? ' is-credit' : ''}`}>
      <div>
        <div className="row wrap" style={{ gap: 9 }}>
          <span className="exception-name">{r.name}</span>
          {r.serviceCredit && <CreditTag />}
        </div>
        <div className="exception-meta row" style={{ gap: 6 }}>
          <SourceChip sourceId={sourceIdFor(r)} label={r.source} plain />
          <span>· {r.sampleSize ? `${r.sampleSize.toLocaleString()} records` : 'no records'} · tolerance {fmtTolerance(r)}</span>
        </div>
      </div>
      <div className="exception-figures">
        <div className="figure">
          <div className="figure-label">Target</div>
          <div className="figure-value" style={{ color: 'var(--ink-3)' }}>{fmtTarget(r)}</div>
        </div>
        <div className="figure">
          <div className="figure-label">Actual</div>
          <div className="figure-value is-bad">{fmtValue(r.actual, r.unit)}</div>
        </div>
        <div className="figure">
          <div className="figure-label">Variance</div>
          <div className="figure-value is-bad">{fmtVariance(r, r.variance)}</div>
        </div>
        <Rag status={r.rag} />
      </div>
    </div>
  );
}

export default function Exceptions({ analysis, sourceIdFor }) {
  const results = analysis.sla_results;
  const breaches = results.filter((r) => r.rag === 'RED');
  const atRisk = results.filter((r) => r.rag === 'AMBER');
  const creditBreaches = breaches.filter((r) => r.serviceCredit);
  const creditTotal = results.filter((r) => r.serviceCredit).length;

  return (
    <>
      <div className="card" style={{ background: creditBreaches.length ? 'linear-gradient(104deg, var(--papaya) 0%, #fff 46%)' : undefined, borderColor: creditBreaches.length ? 'var(--apricot)' : undefined }}>
        <div className="card-pad row" style={{ gap: 16 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 15, display: 'grid', placeItems: 'center',
            background: creditBreaches.length ? 'var(--apricot)' : 'var(--green-bg)',
            color: creditBreaches.length ? '#8a4f14' : 'var(--green)', flex: '0 0 46px',
          }}>
            <IconShield size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16 }}>
              {creditBreaches.length
                ? `${creditBreaches.length} of ${creditTotal} service-credit metrics in breach`
                : 'No service-credit exposure this period'}
            </h2>
            <p className="tiny muted" style={{ marginTop: 5, lineHeight: 1.55 }}>
              {creditBreaches.length
                ? `${creditBreaches.map((r) => r.name).join(', ')} — these are the metrics that carry a contractual financial consequence, so they lead the governance conversation.`
                : 'Every metric carrying a contractual financial consequence is inside its threshold for this period.'}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Breaches</h2>
            <div className="sub">Beyond tolerance — service-credit metrics listed first</div>
          </div>
          <span className="tag warm">{breaches.length} of {results.length}</span>
        </div>
        <div className="card-pad">
          {breaches.length ? (
            [...breaches].sort((a, b) => Number(b.serviceCredit) - Number(a.serviceCredit))
              .map((r) => <ExceptionRow key={r.id} r={r} sourceIdFor={sourceIdFor} />)
          ) : (
            <div className="row" style={{ gap: 10, color: 'var(--green)' }}>
              <IconCircleCheck size={18} />
              <span className="tiny" style={{ color: 'var(--ink-2)' }}>No metric is in breach for this period.</span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>At risk</h2>
            <div className="sub">Missing target but still inside the metric's tolerance band</div>
          </div>
          <span className="tag">{atRisk.length}</span>
        </div>
        <div className="card-pad">
          {atRisk.length ? (
            atRisk.map((r) => <ExceptionRow key={r.id} r={r} sourceIdFor={sourceIdFor} />)
          ) : (
            <span className="tiny muted">Nothing sitting in the amber band.</span>
          )}
        </div>
      </div>

      <div className="teaser">
        <div>
          <div className="row" style={{ gap: 9 }}><IconSpark /><h3>Next phase — from reporting to prediction</h3></div>
          <p>
            Phase 1 answers "where are we". With a few months of packs stored, the same data answers
            "where are we heading": trend lines per metric, a forecast breach date, and an early warning
            before a service credit is actually incurred.
          </p>
          <div className="teaser-tags">
            <span className="teaser-tag">Trend per metric</span>
            <span className="teaser-tag">Predicted breach date</span>
            <span className="teaser-tag">Root-cause clustering</span>
            <span className="teaser-tag">Learned source formats</span>
          </div>
        </div>
        <div className="spark">
          {[16, 22, 19, 28, 25, 34, 31, 42].map((h, i) => (
            <i key={i} style={{ height: h }} className={i > 5 ? 'hot' : undefined} />
          ))}
        </div>
      </div>
    </>
  );
}
