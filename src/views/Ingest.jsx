import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ConfidenceRing from '../components/ConfidenceRing.jsx';
import { SourceChip } from '../components/Chips.jsx';
import { IconCloud, IconCheck, IconCircleDash, IconX, IconWand } from '../components/Icons.jsx';
import { SOURCE_ORDER, styleFor } from '../lib/sources.js';
import { fmtBytes, fmtEvidence } from '../lib/format.js';

const PHASES = ['Reading structure', 'Extracting content', 'Matching templates', 'Resolving as a set'];

export default function Ingest({ month, monthLabel, templates, uploads, samples = [], onRefresh, onGenerate, generating, toast }) {
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState([]);
  const [revealed, setRevealed] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  // Rings animate up from zero on arrival, so the reveal reads as the system deciding.
  useEffect(() => {
    if (!uploads.length) return;
    const t = setTimeout(() => setRevealed(new Set(uploads.map((u) => u.uploadId))), 90);
    return () => clearTimeout(t);
  }, [uploads]);

  useEffect(() => {
    if (!pending.length) return;
    const t = setInterval(() => {
      setPending((rows) => rows.map((r) => ({ ...r, phase: Math.min(PHASES.length - 1, r.phase + 1) })));
    }, 620);
    return () => clearInterval(t);
  }, [pending.length]);

  async function send(files) {
    const list = [...files].filter((f) => /\.(xlsx|xls|csv|pdf|txt)$/i.test(f.name));
    if (!list.length) return toast('Only Excel, CSV and PDF files can be ingested', true);

    setPending(list.map((f, i) => ({ tempId: `${Date.now()}-${i}`, name: f.name, size: f.size, phase: 0 })));
    setBusy(true);
    try {
      const res = await api.upload(month, list);
      if (res.skipped?.length) toast(`${res.skipped.length} file could not be read`, true);
      await onRefresh();
    } catch (err) {
      toast(err.message, true);
    } finally {
      setPending([]);
      setBusy(false);
    }
  }

  async function loadSamples(heldBack) {
    setBusy(true);
    setPending([{ tempId: 'sample', name: heldBack ? 'held-back source file' : 'sample source files', size: null, phase: 0 }]);
    try {
      const res = await api.stageSamples(month, heldBack);
      if (res.note) toast(res.note);
      await onRefresh();
    } catch (err) {
      toast(err.message, true);
    } finally {
      setPending([]);
      setBusy(false);
    }
  }

  async function correct(uploadId, sourceId) {
    try {
      await api.correct(month, uploadId, { sourceId, confirmed: true });
      await onRefresh();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function remove(uploadId) {
    try {
      await api.remove(month, uploadId);
      await onRefresh();
    } catch (err) {
      toast(err.message, true);
    }
  }

  const present = new Set(uploads.map((u) => u.sourceId));
  const templateById = Object.fromEntries(templates.map((t) => [t.id, t]));
  const staged = new Set(uploads.map((u) => u.filename));
  const hasHeldBack = samples.some((s) => s.heldBack && !staged.has(s.name));

  return (
    <div className="ingest-grid">
      {/* ------------------------------------------------------------ intake */}
      <div className="card card-pad">
        <div
          className={`dropzone${over ? ' is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
          onClick={() => fileInput.current?.click()}
        >
          <div className="dropzone-icon"><IconCloud /></div>
          <div className="dropzone-title">Drop source files here</div>
          <div className="dropzone-hint">
            Any of the five sources, in any order, named anything at all. Nothing is selected up front —
            each file is identified from its own structure.
          </div>
          <span className="btn btn-primary btn-sm" style={{ marginTop: 4 }}>Browse files</span>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,.pdf,.txt"
            style={{ display: 'none' }}
            onChange={(e) => { send(e.target.files); e.target.value = ''; }}
          />
        </div>

        <div className="expected">
          <div className="expected-head">Sources received · {present.size} of 5</div>
          {SOURCE_ORDER.map((id) => {
            const tpl = templateById[id];
            const has = present.has(id);
            const s = styleFor(id);
            return (
              <div key={id} className={`expected-row ${has ? 'is-present' : 'is-missing'}`}>
                <span className="src-mark" style={{ background: has ? s.colour : '#d7d3ea' }}>{s.mark}</span>
                <span className="name">{tpl?.label ?? id}</span>
                <span className="expected-tick" style={{ color: has ? s.colour : 'var(--ink-4)' }}>
                  {has ? <IconCheck size={15} /> : <IconCircleDash size={15} />}
                </span>
              </div>
            );
          })}
        </div>

        {/* Only surfaced for a period that actually has a source held back - it exists to
            demonstrate a file arriving after the pack was generated, and is meaningless
            anywhere else. Dragging the file in does exactly the same thing. */}
        {hasHeldBack && (
          <div className="row wrap" style={{ marginTop: 18, gap: 8 }}>
            <button className="btn btn-warm btn-sm" onClick={() => loadSamples(true)} disabled={busy}>
              <IconWand /> Late-arriving file
            </button>
          </div>
        )}
      </div>

      {/* -------------------------------------------------- classification list */}
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Autonomous classification</h2>
            <div className="sub">
              {uploads.length
                ? `${uploads.length} file${uploads.length === 1 ? '' : 's'} identified from structure and content — filenames were not used`
                : 'Files are identified as a set, so ambiguous documents resolve against the ones already claimed'}
            </div>
          </div>
          <button className="btn btn-primary" onClick={onGenerate} disabled={!uploads.length || generating}>
            {generating ? <><span className="spinner" /> Generating</> : <>Generate governance pack</>}
          </button>
        </div>

        <div className="file-list">
          {pending.map((p) => (
            <div key={p.tempId} className="file-row is-working">
              <ConfidenceRing working />
              <div className="file-main">
                <div className="file-name-line">
                  <span className="file-name">{p.name}</span>
                  {p.size != null && <span className="file-meta">{fmtBytes(p.size)}</span>}
                </div>
                <div className="file-why"><span className="phase-text">{PHASES[p.phase]}…</span></div>
              </div>
              <div className="file-actions"><span className="spinner" /></div>
            </div>
          ))}

          {!pending.length && !uploads.length && (
            <div className="empty">
              <div className="empty-icon"><IconCloud size={30} /></div>
              <h3>No source files yet</h3>
              <p>
                Drop the month's extracts on the left. The system reads each file's structure — column
                headers, sheet layout, vocabulary, document shape — and works out which of the five
                sources it came from without being told.
              </p>
            </div>
          )}

          {uploads.map((u) => {
            const corrected = u.confirmedBy === 'user-corrected';
            const shown = revealed.has(u.uploadId) ? u.confidence : 0;
            return (
              <div key={u.uploadId} className={`file-row${corrected ? ' is-corrected' : ''}`}>
                <ConfidenceRing value={shown} locked={u.confirmedBy !== 'auto'} />

                <div className="file-main">
                  <div className="file-name-line">
                    <span className="file-name" title={u.filename}>{u.filename}</span>
                    <SourceChip sourceId={u.sourceId} label={u.sourceLabel} />
                    {u.detectedMonth && u.detectedMonth !== month && (
                      <span className="tag warm">reads as {u.detectedMonth}</span>
                    )}
                    {u.resolvedBySet && <span className="tag muted">resolved against the set</span>}
                    {corrected && <span className="tag warm">corrected by user</span>}
                  </div>

                  <div className="file-why">
                    <span className="muted">{u.rowHint} ·</span>
                    {u.evidence?.slice(0, 4).map((e) => <span key={e} className="why-chip">{fmtEvidence(e)}</span>)}
                    {!u.evidence?.length && <span className="muted">no structural markers found</span>}
                  </div>
                </div>

                <div className="file-actions">
                  <select
                    className="src-select"
                    value={u.sourceId}
                    onChange={(e) => correct(u.uploadId, e.target.value)}
                    title="Confirm or correct the detected source"
                  >
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <button className="icon-btn" onClick={() => remove(u.uploadId)} title="Remove file"><IconX /></button>
                </div>
              </div>
            );
          })}
        </div>

        {uploads.length > 0 && present.size < 5 && (
          <div className="card-pad" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
            <div className="tiny muted">
              {5 - present.size} source{present.size === 4 ? '' : 's'} still outstanding for {monthLabel}. A pack can
              still be generated — unscored metrics are reported as gaps rather than estimated.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
