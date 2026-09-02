import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import Dashboard from './views/Dashboard.jsx';
import Ingest from './views/Ingest.jsx';
import Consolidated from './views/Consolidated.jsx';
import Exceptions from './views/Exceptions.jsx';
import Pack from './views/Pack.jsx';
import Logo from './components/Logo.jsx';
import { IconCloud, IconGrid, IconAlert, IconDoc, IconClock, IconLayers } from './components/Icons.jsx';
import { fmtStamp, relativeTime } from './lib/format.js';

const VIEWS = [
  { id: 'ingest', label: 'Ingest & classify', icon: IconCloud, needsPack: false },
  { id: 'consolidated', label: 'Consolidated data', icon: IconGrid, needsPack: true },
  { id: 'exceptions', label: 'SLA exceptions', icon: IconAlert, needsPack: true },
  { id: 'pack', label: 'Governance pack', icon: IconDoc, needsPack: true },
];

const TITLES = { dashboard: 'Governance dashboard' };

/**
 * A period with a pack already published is not being ingested for the first time — adding
 * evidence to it is a re-ingestion, and the label says so. The screen itself is identical:
 * same drop zone, same classification, same source checklist.
 */
const viewLabel = (v, hasPack) => (v.id === 'ingest' && hasPack ? 'Initiate re-ingestion' : v.label);

export default function App() {
  const [boot, setBoot] = useState(null);
  const [month, setMonth] = useState(null); // null = dashboard
  const [uploads, setUploads] = useState([]);
  const [samples, setSamples] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [view, setView] = useState('ingest');
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const notify = useCallback((message, bad = false) => {
    setToast({ message, bad });
    setTimeout(() => setToast(null), 3600);
  }, []);

  const loadBoot = useCallback(async () => {
    const b = await api.bootstrap();
    setBoot(b);
    return b;
  }, []);

  useEffect(() => {
    loadBoot().catch((e) => setError(e.message));
  }, [loadBoot]);

  // Screens are addressable — "#2026-08/exceptions" — so a demo can be resumed mid-flow
  // and a specific period's pack can be linked to directly.
  useEffect(() => {
    const apply = () => {
      const [m, v] = window.location.hash.replace('#', '').split('/');
      if (/^\d{4}-\d{2}$/.test(m)) {
        setMonth(m);
        if (VIEWS.some((x) => x.id === v)) setView(v);
      } else {
        setMonth(null);
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  useEffect(() => {
    const want = month ? `#${month}/${view}` : '#dashboard';
    if (window.location.hash !== want) window.history.replaceState(null, '', want);
  }, [month, view]);

  const loadMonth = useCallback(async (key) => {
    if (!key) return null;
    const [u, a] = await Promise.all([
      api.uploads(key).catch(() => ({ uploads: [], samples: [] })),
      api.analysis(key).catch(() => null),
    ]);
    setUploads(u.uploads ?? []);
    setSamples(u.samples ?? []);
    setAnalysis(a);
    return a;
  }, []);

  useEffect(() => {
    if (month) loadMonth(month);
    else { setUploads([]); setSamples([]); setAnalysis(null); }
  }, [month, loadMonth]);

  const refresh = useCallback(async () => {
    await loadMonth(month);
    await loadBoot();
  }, [month, loadMonth, loadBoot]);

  /** Open a period. Lands on its analysis if one exists, otherwise on ingestion. */
  const openMonth = useCallback(async (key, preferred = 'consolidated') => {
    setMonth(key);
    const a = await loadMonth(key);
    setView(a ? preferred : 'ingest');
  }, [loadMonth]);

  async function startCurrent() {
    setStarting(true);
    try {
      const { month: key } = await api.createSpace(boot.currentMonth);
      const b = await loadBoot();
      setMonth(key);
      const a = await loadMonth(key);
      setView(a ? 'consolidated' : 'ingest');
      if (!b.currentMonthOpen) notify(`Reporting period opened for ${boot.currentMonthLabel}`);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setStarting(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const a = await api.generate(month);
      setAnalysis(a);
      await loadBoot();
      setView('consolidated');
      notify(`Governance pack generated for ${a.label}`);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setGenerating(false);
    }
  }

  // A metric names its source as "BaNCS"; the template calls itself "BaNCS extract".
  // metricSource joins the two vocabularies — both spellings map here.
  const labelToId = useMemo(() => {
    const map = {};
    for (const t of boot?.sourceTemplates ?? []) {
      map[t.label] = t.id;
      if (t.metricSource) map[t.metricSource] = t.id;
    }
    return map;
  }, [boot]);

  const sourceIdFor = useCallback((r) => labelToId[r.source] ?? 'unknown', [labelToId]);
  const metricName = useCallback((id) => boot?.metrics?.find((m) => m.id === id)?.name ?? id, [boot]);

  // A pack generated before the newest upload is out of date, and should say so.
  const pendingRegen = useMemo(() => {
    if (!analysis || !uploads.length) return false;
    return uploads.some((u) => new Date(u.uploadedAt) > new Date(analysis.generated_at));
  }, [analysis, uploads]);

  if (error) {
    return (
      <div className="empty" style={{ paddingTop: 120 }}>
        <div className="empty-icon"><IconAlert size={26} /></div>
        <h3>Cannot reach the API</h3>
        <p>{error}. Start it with <code>npm run dev</code> and reload.</p>
      </div>
    );
  }
  if (!boot) return <div className="empty" style={{ paddingTop: 140 }}><span className="spinner" /></div>;

  const onDashboard = !month;
  const activeMonth = boot.months.find((m) => m.month === month);
  const hasPack = !!analysis;
  const currentView = VIEWS.find((v) => v.id === view);

  return (
    <div className="app">
      {/* -------------------------------------------------------------- rail */}
      <aside className="rail">
        <div className="brand">
          <Logo height={28} />
          <div className="brand-sub">SLA Governance</div>
        </div>

        <nav className="nav">
          <button className={`nav-item${onDashboard ? ' is-active' : ''}`} onClick={() => setMonth(null)}>
            <IconLayers size={16} /> Dashboard
            {boot.months.length > 0 && <span className="nav-count">{boot.months.length}</span>}
          </button>
        </nav>

        {boot.months.length > 0 && (
          <div>
            <div className="rail-label">Reporting periods</div>
            <div className="month-list">
              {boot.months.map((m) => {
                const s = m.summary;
                return (
                  <button
                    key={m.month}
                    className={`month-card${m.month === month ? ' is-active' : ''}`}
                    onClick={() => openMonth(m.month)}
                  >
                    <div className="month-card-top">
                      <span className="month-card-name">{m.label}</span>
                      {s && (
                        <span className="month-dots">
                          {s.RED > 0 && <i className="dot r" />}
                          {s.AMBER > 0 && <i className="dot a" />}
                          {s.GREEN > 0 && <i className="dot g" />}
                          {s.NO_DATA > 0 && <i className="dot n" />}
                        </span>
                      )}
                    </div>
                    <div className="month-card-meta">
                      {m.generatedAt
                        ? `${s.breaches} breach${s.breaches === 1 ? '' : 'es'} · ${relativeTime(m.generatedAt)}`
                        : m.uploadCount
                          ? `${m.uploadCount} file${m.uploadCount === 1 ? '' : 's'} staged · no pack yet`
                          : 'open · no files yet'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!onDashboard && (
          <div>
            <div className="rail-label">{activeMonth?.label ?? month}</div>
            <nav className="nav">
              {VIEWS.map((v) => {
                const Icon = v.icon;
                const disabled = v.needsPack && !hasPack;
                return (
                  <button
                    key={v.id}
                    className={`nav-item${view === v.id ? ' is-active' : ''}`}
                    disabled={disabled}
                    onClick={() => !disabled && setView(v.id)}
                  >
                    <Icon size={16} />
                    {viewLabel(v, hasPack)}
                    {v.id === 'ingest' && uploads.length > 0 && <span className="nav-count">{uploads.length}</span>}
                    {v.id === 'exceptions' && analysis?.summary?.breaches > 0 && (
                      <span className="nav-count">{analysis.summary.breaches}</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        <div className="rail-foot">
          Phase 1 prototype · synthetic data<br />
          Source type identified from document structure, never from filename.
        </div>
      </aside>

      {/* -------------------------------------------------------------- main */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{onDashboard ? TITLES.dashboard : viewLabel(currentView, hasPack)}</h1>
            {!onDashboard && <span className="topbar-sub">{activeMonth?.label ?? month}</span>}
          </div>
          {onDashboard ? (
            <div className="stamp">
              <IconClock />
              <span>{boot.months.length} reporting period{boot.months.length === 1 ? '' : 's'} on record</span>
            </div>
          ) : analysis ? (
            <div className={`stamp${pendingRegen ? ' is-stale' : ''}`}>
              <IconClock />
              {pendingRegen ? (
                <span>New evidence since last run — <b>regenerate to refresh</b></span>
              ) : (
                <span>Last generated <b>{fmtStamp(analysis.generated_at)}</b></span>
              )}
            </div>
          ) : (
            <div className="stamp"><IconClock /><span>No pack generated for this period</span></div>
          )}
        </header>

        <div className="page">
          {onDashboard && (
            <Dashboard boot={boot} onOpenMonth={openMonth} onStartCurrent={startCurrent} starting={starting} />
          )}

          {!onDashboard && view === 'ingest' && (
            <Ingest
              month={month}
              monthLabel={activeMonth?.label ?? month}
              templates={boot.sourceTemplates}
              uploads={uploads}
              samples={samples}
              onRefresh={refresh}
              onGenerate={generate}
              generating={generating}
              toast={notify}
            />
          )}
          {!onDashboard && view === 'consolidated' && analysis && (
            <Consolidated analysis={analysis} sourceIdFor={sourceIdFor} metricName={metricName} />
          )}
          {!onDashboard && view === 'exceptions' && analysis && (
            <Exceptions analysis={analysis} sourceIdFor={sourceIdFor} />
          )}
          {!onDashboard && view === 'pack' && analysis && (
            <Pack analysis={analysis} sourceIdFor={sourceIdFor} metricName={metricName} />
          )}

          {!onDashboard && view !== 'ingest' && hasPack && (
            <div className="row no-print" style={{ justifyContent: 'space-between', paddingTop: 4 }}>
              <span className="tiny muted">
                Generated from {analysis.source_files.length} source file
                {analysis.source_files.length === 1 ? '' : 's'} · every figure calculated by rules, not inferred
              </span>
              <button className="btn btn-ghost btn-sm" onClick={generate} disabled={generating}>
                {generating ? <><span className="spinner" /> Regenerating</> : 'Regenerate for this period'}
              </button>
            </div>
          )}
        </div>
      </main>

      {toast && <div className={`toast${toast.bad ? ' is-bad' : ''}`}>{toast.message}</div>}
    </div>
  );
}
