import { useEffect, useMemo, useRef, useState } from 'react';
import Logo from './Logo.jsx';
import { IconLayers, IconSearch, IconBolt, IconChevron, IconCircleCheck } from './Icons.jsx';
import { relativeTime } from '../lib/format.js';

/**
 * Left navigation.
 *
 * Two rules drive the shape of this: it must never scroll, and it must not feel packed.
 * Those pull against each other once there are more reporting periods than fit, so the rail
 * shows only the most recent few and makes everything older reachable by search rather than
 * by growing the list. The per-period views collapse behind a single Actions control for the
 * same reason — four nav rows appearing the moment you open a period was what pushed the
 * rail past the fold.
 */

const VISIBLE_PERIODS = 4;
const MAX_RESULTS = 6;

const MONTH_WORDS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Every string a period could reasonably be searched by: the full label, the ISO key, and
 * the three-letter abbreviation — so "apr", "april", "apr 2026" and "2026-04" all land.
 */
function haystack(m) {
  const idx = Number(m.month.slice(5, 7)) - 1;
  const word = MONTH_WORDS[idx] ?? '';
  return `${m.label} ${m.month} ${word} ${word.slice(0, 3)}`.toLowerCase();
}

/** Every whitespace-separated term must appear, so "apr 26" narrows rather than widens. */
const matches = (m, query) => {
  const hay = haystack(m);
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
};

export default function Rail({
  boot, month, view, views, uploads, analysis, hasPack, viewLabel, onOpenMonth, onDashboard, onSelectView,
}) {
  const [query, setQuery] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const actionsRef = useRef(null);
  const popRef = useRef(null);

  const searching = query.trim().length > 0;
  const activeMonth = boot.months.find((m) => m.month === month);

  const periods = useMemo(() => {
    if (searching) return boot.months.filter((m) => matches(m, query.trim())).slice(0, MAX_RESULTS);
    // boot.months arrives newest first.
    const latest = boot.months.slice(0, VISIBLE_PERIODS);
    // A period opened from a search result must not vanish from the rail behind it.
    if (month && !latest.some((m) => m.month === month) && activeMonth) return [...latest, activeMonth];
    return latest;
  }, [boot.months, query, searching, month, activeMonth]);

  const hidden = boot.months.length - Math.min(VISIBLE_PERIODS, boot.months.length);

  // The popover belongs to a period. Leaving one — including to the dashboard, which is a
  // hash change rather than a reload — must take the menu with it.
  useEffect(() => setActionsOpen(false), [month]);

  // Close the Actions popover on outside click or Escape.
  useEffect(() => {
    if (!actionsOpen) return;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || actionsRef.current?.contains(e.target)) return;
      setActionsOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setActionsOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [actionsOpen]);

  // The popover floats over the page, so it is positioned from the button's live rect
  // rather than nested inside the rail where overflow would clip it.
  function toggleActions() {
    if (actionsOpen) return setActionsOpen(false);
    const r = actionsRef.current?.getBoundingClientRect();
    if (r) setAnchor({ left: r.right + 12, top: Math.min(r.top, window.innerHeight - 300) });
    setActionsOpen(true);
  }

  const currentView = views.find((v) => v.id === view);

  return (
    <>
      <aside className="rail">
        <div className="rail-glow" aria-hidden="true" />

        <div className="brand">
          <Logo height={30} />
          <div className="brand-sub">SLA Governance</div>
        </div>

        <nav className="nav">
          <button className={`nav-item${!month ? ' is-active' : ''}`} onClick={onDashboard}>
            <IconLayers size={17} /> Dashboard
            {boot.months.length > 0 && <span className="nav-count">{boot.months.length}</span>}
          </button>
        </nav>

        {boot.months.length > 0 && (
          <div className="rail-section">
            <div className="rail-label">
              Reporting periods
              {!searching && hidden > 0 && <span className="rail-label-hint">{hidden} older</span>}
            </div>

            <div className={`rail-search${searching ? ' is-active' : ''}`}>
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={hidden > 0 ? 'Search any period…' : 'Search periods…'}
                aria-label="Search reporting periods"
              />
              {searching && (
                <button className="rail-search-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>
              )}
            </div>

            <div className="month-list">
              {periods.map((m) => (
                <PeriodCard key={m.month} m={m} active={m.month === month} onOpen={() => { onOpenMonth(m.month); setQuery(''); }} />
              ))}

              {searching && periods.length === 0 && (
                <div className="rail-empty">No period matches “{query.trim()}”.</div>
              )}
            </div>
          </div>
        )}

        {month && (
          <div className="rail-section">
            <div className="rail-label">{activeMonth?.label ?? month}</div>
            <button
              ref={actionsRef}
              className={`actions-btn${actionsOpen ? ' is-open' : ''}`}
              onClick={toggleActions}
              aria-expanded={actionsOpen}
              aria-haspopup="menu"
            >
              <span className="actions-icon"><IconBolt size={15} /></span>
              <span className="actions-text">
                <span className="actions-title">Actions</span>
                <span className="actions-current">{currentView ? viewLabel(currentView, hasPack) : 'Choose a view'}</span>
              </span>
              <span className="actions-chevron"><IconChevron /></span>
            </button>
          </div>
        )}

        <div className="rail-foot">
          Phase 1 · 2 prototype · synthetic data
          <span className="rail-foot-more"><br />Source type identified from document structure, never from filename.</span>
        </div>
      </aside>

      {actionsOpen && anchor && (
        <div className="actions-pop" ref={popRef} style={{ left: anchor.left, top: anchor.top }} role="menu">
          <div className="actions-pop-head">{activeMonth?.label ?? month}</div>
          {views.map((v) => {
            const Icon = v.icon;
            const disabled = v.needsPack && !hasPack;
            const active = v.id === view;
            const count =
              v.id === 'ingest' ? uploads.length
                : v.id === 'exceptions' ? analysis?.summary?.breaches ?? 0
                  : 0;
            return (
              <button
                key={v.id}
                className={`actions-item${active ? ' is-active' : ''}`}
                disabled={disabled}
                role="menuitem"
                onClick={() => { onSelectView(v.id); setActionsOpen(false); }}
              >
                <span className="actions-item-icon"><Icon size={16} /></span>
                <span className="actions-item-body">
                  <span className="actions-item-label">{viewLabel(v, hasPack)}</span>
                  {disabled && <span className="actions-item-note">Generate a pack first</span>}
                </span>
                {count > 0 && <span className="actions-item-count">{count}</span>}
                {active && <span className="actions-item-tick"><IconCircleCheck size={15} /></span>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function PeriodCard({ m, active, onOpen }) {
  const s = m.summary;
  const segments = s
    ? [
        { n: s.GREEN, c: 'var(--green)' },
        { n: s.AMBER, c: '#e59a3c' },
        { n: s.RED, c: 'var(--red)' },
        { n: s.NO_DATA, c: 'rgba(255,255,255,0.28)' },
      ].filter((x) => x.n > 0)
    : [];

  return (
    <button className={`month-card${active ? ' is-active' : ''}`} onClick={onOpen}>
      <div className="month-card-top">
        <span className="month-card-name">{m.label}</span>
        {s?.serviceCreditBreaches > 0 && <span className="month-credit">{s.serviceCreditBreaches}</span>}
      </div>
      <div className="month-card-meta">
        {m.generatedAt
          ? `${s.breaches} breach${s.breaches === 1 ? '' : 'es'} · ${relativeTime(m.generatedAt)}`
          : m.uploadCount
            ? `${m.uploadCount} file${m.uploadCount === 1 ? '' : 's'} staged`
            : 'open · no files yet'}
      </div>
      {segments.length > 0 && (
        <div className="month-bar">
          {segments.map((seg, i) => <span key={i} style={{ flex: seg.n, background: seg.c }} />)}
        </div>
      )}
    </button>
  );
}
