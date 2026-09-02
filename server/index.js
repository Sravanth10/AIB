import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';

import { SOURCE_TEMPLATES, templateById } from './classify.js';
import { SLA_METRICS } from './slaEngine.js';
import { ingest, generate } from './pipeline.js';
import {
  ROOT, listMonths, monthLabel, isMonthKey, createSpace, currentMonthKey,
  readUploadIndex, writeUploadIndex, readAnalysis, deleteUploadFile, listSampleFiles,
} from './store.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 12 } });

app.use(express.json());

const PORT = process.env.PORT || 5174;
const fail = (res, code, message) => res.status(code).json({ error: message });

// --- routes -----------------------------------------------------------------

app.get('/api/bootstrap', (req, res) => {
  const months = listMonths().map((m) => {
    const a = readAnalysis(m);
    return {
      month: m,
      label: monthLabel(m),
      generatedAt: a?.generated_at ?? null,
      uploadCount: readUploadIndex(m).length,
      sourceCount: a?.source_files?.length ?? 0,
      sampleCount: listSampleFiles(m).filter((f) => !f.heldBack).length,
      qualityFlags: a?.quality_summary?.total ?? 0,
      summary: a?.summary ?? null,
    };
  });
  const current = currentMonthKey();
  res.json({
    months,
    currentMonth: current,
    currentMonthLabel: monthLabel(current),
    currentMonthOpen: months.some((m) => m.month === current),
    sourceTemplates: SOURCE_TEMPLATES.map(({ id, label, blurb, metricSource }) => ({ id, label, blurb, metricSource })),
    metrics: SLA_METRICS,
  });
});

/** Open a reporting period — this is what "start SLA governance" does. */
app.post('/api/spaces/:month', (req, res) => {
  const { month } = req.params;
  if (!isMonthKey(month)) return fail(res, 400, 'Invalid reporting month');
  const result = createSpace(month);
  res.json({ ...result, label: monthLabel(month), sampleCount: listSampleFiles(month).length });
});

app.get('/api/uploads/:month', (req, res) => {
  const { month } = req.params;
  if (!isMonthKey(month)) return fail(res, 400, 'Invalid reporting month');
  res.json({ month, uploads: readUploadIndex(month), samples: listSampleFiles(month) });
});

app.post('/api/uploads/:month', upload.array('files', 12), async (req, res) => {
  const { month } = req.params;
  if (!isMonthKey(month)) return fail(res, 400, 'Invalid reporting month');
  if (!req.files?.length) return fail(res, 400, 'No files received');
  const incoming = req.files.map((f) => ({ originalName: f.originalname, buffer: f.buffer }));
  res.json({ month, ...(await ingest(month, incoming)) });
});

/** Stage the bundled sample files - a fallback when drag-and-drop is not practical. */
app.post('/api/uploads/:month/samples', async (req, res) => {
  const { month } = req.params;
  if (!isMonthKey(month)) return fail(res, 400, 'Invalid reporting month');
  const wantHeld = req.body?.heldBack === true;
  const files = listSampleFiles(month).filter((f) => f.heldBack === wantHeld);
  if (!files.length) return fail(res, 404, wantHeld ? 'No held-back sample for this month' : 'No sample files for this month');

  const existing = new Set(readUploadIndex(month).map((e) => e.filename));
  const incoming = files
    .filter((f) => !existing.has(f.name))
    .map((f) => ({ originalName: f.name, buffer: fs.readFileSync(f.absolute) }));
  if (!incoming.length) return res.json({ month, added: [], skipped: [], note: 'Already staged' });

  res.json({ month, ...(await ingest(month, incoming)) });
});

/** Confirm or correct a classification. This is the governance trust layer. */
app.patch('/api/uploads/:month/:uploadId', (req, res) => {
  const { month, uploadId } = req.params;
  const { sourceId, confirmed } = req.body ?? {};
  if (!isMonthKey(month)) return fail(res, 400, 'Invalid reporting month');

  const index = readUploadIndex(month);
  const entry = index.find((e) => e.uploadId === uploadId);
  if (!entry) return fail(res, 404, 'Upload not found');

  if (sourceId) {
    const tpl = templateById(sourceId);
    if (!tpl) return fail(res, 400, `Unknown source type "${sourceId}"`);
    if (sourceId !== entry.sourceId) {
      entry.autoSourceId = entry.autoSourceId ?? entry.sourceId;
      entry.sourceId = sourceId;
      entry.sourceLabel = tpl.label;
      entry.blurb = tpl.blurb;
      entry.confidence = 1;
      entry.confirmedBy = 'user-corrected';
    }
  }
  if (confirmed) entry.confirmedBy = entry.confirmedBy === 'user-corrected' ? 'user-corrected' : 'user-confirmed';

  writeUploadIndex(month, index);
  res.json(entry);
});

app.delete('/api/uploads/:month/:uploadId', (req, res) => {
  const { month, uploadId } = req.params;
  if (!isMonthKey(month)) return fail(res, 400, 'Invalid reporting month');
  const index = readUploadIndex(month);
  const entry = index.find((e) => e.uploadId === uploadId);
  if (entry) deleteUploadFile(month, entry.stored);
  writeUploadIndex(month, index.filter((e) => e.uploadId !== uploadId));
  res.json({ ok: true });
});

app.post('/api/generate/:month', async (req, res) => {
  const { month } = req.params;
  if (!isMonthKey(month)) return fail(res, 400, 'Invalid reporting month');
  if (!readUploadIndex(month).length) return fail(res, 400, 'No source files uploaded for this period');
  try {
    res.json(await generate(month));
  } catch (err) {
    fail(res, 500, err.message);
  }
});

app.get('/api/analysis/:month', (req, res) => {
  const { month } = req.params;
  if (!isMonthKey(month)) return fail(res, 400, 'Invalid reporting month');
  const a = readAnalysis(month);
  if (!a) return fail(res, 404, 'No pack has been generated for this period yet');
  res.json(a);
});

// Serve the built frontend when one exists, so the demo can run from a single process.
const DIST = path.join(ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`AIB Life prototype API  ->  http://localhost:${PORT}`);
});
