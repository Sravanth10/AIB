import Logo from '../components/Logo.jsx';
import { IconSpark, IconAlert, IconDoc, IconCloud, IconShield, IconClock } from '../components/Icons.jsx';
import { fmtStamp, relativeTime } from '../lib/format.js';

/**
 * Landing screen. Governance is organised by reporting period, so the first thing on screen
 * is the shelf of periods already closed off, plus one action: open the current one.
 */
export default function Dashboard({ boot, onOpenMonth, onStartCurrent, starting }) {
  const months = boot.months;
  const withPacks = months.filter((m) => m.generatedAt);
  const inProgress = months.filter((m) => !m.generatedAt);

  const totals = withPacks.reduce(
    (acc, m) => ({
      breaches: acc.breaches + (m.summary?.breaches ?? 0),
      credit: acc.credit + (m.summary?.serviceCreditBreaches ?? 0),
      sources: acc.sources + (m.sourceCount ?? 0),
    }),
    { breaches: 0, credit: 0, sources: 0 },
  );

  return (
    <div className="dash">
      {/* ------------------------------------------------------------- hero */}
      <div className="dash-hero">
        <div className="dash-hero-body">
          <Logo height={30} plate={false} />
          <h1>SLA Governance</h1>
          <p>
            Fifteen contracted service levels, five source systems, one pack a month. Drop the period's
            extracts in and the platform identifies each source, consolidates the data, scores it against
            contracted thresholds and publishes the governance pack.
          </p>
          <div className="dash-hero-actions">
            <button className="btn btn-hero" onClick={onStartCurrent} disabled={starting}>
              {starting ? <><span className="spinner" /> Opening</> : (
                <>
                  <IconSpark />
                  {boot.currentMonthOpen ? `Continue ${boot.currentMonthLabel}` : 'Start SLA governance for current month'}
                </>
              )}
            </button>
            <span className="dash-hero-note">
              Current period · <b>{boot.currentMonthLabel}</b>
              {boot.currentMonthOpen && ' · already open'}
            </span>
          </div>
        </div>

        {withPacks.length > 0 && (
          <div className="dash-hero-stats">
            <HeroStat label="Periods closed" value={withPacks.length} />
            <HeroStat label="Source files processed" value={totals.sources} />
            <HeroStat label="Breaches recorded" value={totals.breaches} tone="red" />
            <HeroStat label="Service-credit events" value={totals.credit} tone="warm" />
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- in-progress */}
      {inProgress.length > 0 && (
        <section>
          <div className="dash-section-head">
            <h2>In progress</h2>
            <span className="tiny muted">Files staged, pack not yet generated</span>
          </div>
          <div className="dash-grid">
            {inProgress.map((m) => (
              <button key={m.month} className="period-card is-open" onClick={() => onOpenMonth(m.month, 'ingest')}>
                <div className="period-top">
                  <span className="period-label">{m.label}</span>
                  <span className="tag warm">Open</span>
                </div>
                <div className="period-empty">
                  <IconCloud size={26} />
                  <span>{m.uploadCount ? `${m.uploadCount} of 5 sources received` : 'No source files yet'}</span>
                </div>
                <div className="period-foot">
                  <span>{m.uploadCount ? 'Continue ingestion' : 'Start ingesting'} →</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* --------------------------------------------------- closed periods */}
      <section>
        <div className="dash-section-head">
          <h2>Reporting periods</h2>
          <span className="tiny muted">
            {withPacks.length ? 'Open a period to see its consolidated data, exceptions and pack' : 'Nothing generated yet'}
          </span>
        </div>

        {withPacks.length === 0 ? (
          <div className="card empty">
            <div className="empty-icon"><IconDoc size={26} /></div>
            <h3>No governance packs yet</h3>
            <p>Start the current reporting period above, drop in the month's extracts, and the first pack will appear here.</p>
          </div>
        ) : (
          <div className="dash-grid">
            {withPacks.map((m) => <PeriodCard key={m.month} m={m} onOpen={onOpenMonth} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function HeroStat({ label, value, tone }) {
  return (
    <div className={`hero-stat${tone ? ` tone-${tone}` : ''}`}>
      <div className="hero-stat-value">{value}</div>
      <div className="hero-stat-label">{label}</div>
    </div>
  );
}

function PeriodCard({ m, onOpen }) {
  const s = m.summary;
  const segments = [
    { key: 'GREEN', n: s.GREEN, colour: 'var(--green)' },
    { key: 'AMBER', n: s.AMBER, colour: '#e59a3c' },
    { key: 'RED', n: s.RED, colour: 'var(--red)' },
    { key: 'NO_DATA', n: s.NO_DATA, colour: 'var(--nodata)' },
  ].filter((x) => x.n > 0);

  const clean = s.breaches === 0;

  return (
    <button className={`period-card${s.serviceCreditBreaches > 0 ? ' has-credit' : ''}`} onClick={() => onOpen(m.month, 'consolidated')}>
      <div className="period-top">
        <span className="period-label">{m.label}</span>
        {s.serviceCreditBreaches > 0 ? (
          <span className="tag warm">{s.serviceCreditBreaches} credit</span>
        ) : clean ? (
          <span className="tag" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>Clean</span>
        ) : (
          <span className="tag muted">{s.breaches} breach{s.breaches === 1 ? '' : 'es'}</span>
        )}
      </div>

      <div className="period-headline">
        <span className="period-figure" style={{ color: clean ? 'var(--green)' : 'var(--red)' }}>{s.breaches}</span>
        <span className="period-figure-label">breach{s.breaches === 1 ? '' : 'es'} of {s.total} service levels</span>
      </div>

      <div className="period-bar">
        {segments.map((seg) => (
          <span key={seg.key} style={{ flex: seg.n, background: seg.colour }} title={`${seg.key}: ${seg.n}`} />
        ))}
      </div>
      <div className="period-legend">
        <span><i style={{ background: 'var(--green)' }} />{s.GREEN} on target</span>
        <span><i style={{ background: '#e59a3c' }} />{s.AMBER} at risk</span>
        <span><i style={{ background: 'var(--red)' }} />{s.RED} breach</span>
        {s.NO_DATA > 0 && <span><i style={{ background: 'var(--nodata)' }} />{s.NO_DATA} no data</span>}
      </div>

      <div className="period-foot">
        <span className="row" style={{ gap: 6 }}>
          <IconClock /> {relativeTime(m.generatedAt)}
        </span>
        <span>{m.sourceCount} sources{m.qualityFlags ? ` · ${m.qualityFlags} DQ flags` : ''}</span>
      </div>
      <div className="period-stamp">Generated {fmtStamp(m.generatedAt)}</div>
    </button>
  );
}
