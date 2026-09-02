import crypto from 'node:crypto';

import { parseFile, detectMonth } from './parse.js';
import { classifyBatch } from './classify.js';
import { runAdapter } from './adapters/index.js';
import { SLA_METRICS, buildResults, summarise } from './slaEngine.js';
import { assessQuality, qualitySummary } from './dataQuality.js';
import {
  monthLabel, readUploadIndex, writeUploadIndex, saveUploadFile, readUploadFile, writeAnalysis,
} from './store.js';

/**
 * The ingestion and pack-generation pipeline, independent of HTTP.
 *
 * Kept out of the route layer so it can be driven directly by scripts — the demo-state
 * preparation script uses exactly the same code path the UI does, which is the only way to
 * be sure a "prepared" state matches a hand-driven one.
 */

/** Parse + classify a batch of {originalName, buffer} as a SET, then persist each file. */
export async function ingest(monthKey, incoming) {
  const docs = [];
  const skipped = [];
  for (const file of incoming) {
    try {
      docs.push({ file, doc: await parseFile(file.buffer, file.originalName) });
    } catch (err) {
      skipped.push({ filename: file.originalName, error: err.message });
    }
  }
  if (!docs.length) return { added: [], skipped };

  const classified = classifyBatch(docs.map((d) => d.doc));
  const index = readUploadIndex(monthKey);
  const added = [];

  docs.forEach(({ file, doc }, i) => {
    const c = classified[i];
    const uploadId = crypto.randomUUID().slice(0, 8);
    const stored = saveUploadFile(monthKey, uploadId, file.originalName, file.buffer);
    const detected = detectMonth(doc);
    const entry = {
      uploadId,
      stored,
      filename: file.originalName,
      ext: doc.ext,
      bytes: file.buffer.length,
      uploadedAt: new Date().toISOString(),
      sourceId: c.sourceId,
      sourceLabel: c.sourceLabel,
      blurb: c.blurb,
      confidence: Math.round(c.confidence * 100) / 100,
      evidence: c.evidence,
      conflicts: c.conflicts,
      resolvedBySet: c.resolvedBySet,
      ranked: c.ranked,
      method: c.method,
      confirmedBy: 'auto',
      shape: doc.shape,
      detectedMonth: detected?.month ?? null,
      rowHint: doc.headerRow
        ? `header on row ${doc.headerRow.index + 1}${doc.headerRow.sheet ? ` of "${doc.headerRow.sheet}"` : ''}`
        : `${doc.pages ?? '?'} page PDF`,
    };
    index.push(entry);
    added.push(entry);
  });

  writeUploadIndex(monthKey, index);
  return { added, skipped };
}

/** Re-read every file uploaded for the month and rebuild the pack from scratch. */
export async function generate(monthKey) {
  const index = readUploadIndex(monthKey);
  const sources = [];

  for (const entry of index) {
    let result = { metrics: {}, error: null };
    try {
      const doc = await parseFile(readUploadFile(monthKey, entry.stored), entry.filename);
      result = runAdapter(entry.sourceId, doc);
    } catch (err) {
      result = { metrics: {}, error: `Could not re-read the file: ${err.message}` };
    }
    sources.push({
      uploadId: entry.uploadId,
      filename: entry.filename,
      sourceId: entry.sourceId,
      sourceLabel: entry.sourceLabel,
      confidence: entry.confidence,
      confirmedBy: entry.confirmedBy,
      detectedMonth: entry.detectedMonth,
      uploadedAt: entry.uploadedAt,
      bytes: entry.bytes,
      metrics: result.metrics ?? {},
      coverage: result.coverage ?? null,
      stats: result.stats ?? {},
      error: result.error ?? null,
    });
  }

  // Fold every source's metric values into one map, recording which file each came from.
  const valuesById = {};
  const contested = [];
  for (const s of sources) {
    for (const [id, v] of Object.entries(s.metrics)) {
      if (valuesById[id]) {
        contested.push({
          metric: id,
          files: [valuesById[id].sourceFile, s.filename],
          values: [valuesById[id].value, v.value],
        });
      }
      valuesById[id] = { ...v, sourceFile: s.filename, sourceId: s.sourceId };
    }
  }

  const results = buildResults(valuesById);
  const flags = assessQuality({ monthKey, sources, results });

  for (const c of contested) {
    flags.unshift({
      id: `value_conflict:${c.metric}`,
      type: 'value_conflict',
      severity: 'red',
      metric: c.metric,
      title: `Conflicting values for ${SLA_METRICS.find((m) => m.id === c.metric)?.name ?? c.metric}`,
      detail: `${c.files.join(' and ')} both report this metric (${c.values.join(' vs ')}). The later file was used.`,
      affectedMetrics: [c.metric],
    });
  }

  return writeAnalysis(monthKey, {
    reporting_month: monthKey,
    label: monthLabel(monthKey),
    generated_at: new Date().toISOString(),
    source_files: sources.map(({ metrics, ...rest }) => ({ ...rest, metricCount: Object.keys(metrics).length })),
    sla_results: results,
    summary: summarise(results),
    data_quality_flags: flags,
    quality_summary: qualitySummary(flags),
  });
}
