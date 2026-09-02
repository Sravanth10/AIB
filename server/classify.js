import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalise } from './parse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { templates: TEMPLATES } = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'source-templates.json'), 'utf8'));

export const SOURCE_TEMPLATES = TEMPLATES;
export const templateById = (id) => TEMPLATES.find((t) => t.id === id);

const WEIGHTS = { required: 0.42, signature: 0.18, vocabulary: 0.25, shape: 0.15 };
const NEGATIVE_PENALTY = 0.12;

/** A token counts as present if it appears in a column header or anywhere in the content. */
function has(doc, token) {
  const t = normalise(token);
  if (!t) return false;
  return doc.normalisedHeaders.some((h) => h.includes(t)) || doc.text.includes(t);
}

function hitRatio(doc, list) {
  if (!list?.length) return { ratio: 0, hits: [] };
  const hits = list.filter((t) => has(doc, t));
  return { ratio: hits.length / list.length, hits };
}

/**
 * Score one document against one template. Everything here is content-derived - no part of
 * the filename reaches this function.
 */
export function scoreTemplate(doc, tpl) {
  const required = hitRatio(doc, tpl.requiredHeaders);
  const signature = hitRatio(doc, tpl.signatureHeaders);
  const vocabulary = hitRatio(doc, tpl.vocabulary);
  const negative = hitRatio(doc, tpl.negative);

  const shapeMatch = tpl.shapes.includes(doc.shape)
    ? 1
    : // grid and grid-offset-header are the same family; a partial credit keeps a tidy
      // tracker (header on row 1) from being disqualified outright.
      tpl.shapes.some((s) => s.startsWith('grid')) && doc.shape.startsWith('grid')
      ? 0.7
      : 0;

  const raw =
    required.ratio * WEIGHTS.required +
    signature.ratio * WEIGHTS.signature +
    vocabulary.ratio * WEIGHTS.vocabulary +
    shapeMatch * WEIGHTS.shape;

  const penalty = Math.min(0.35, negative.hits.length * NEGATIVE_PENALTY);
  const score = Math.max(0, raw - penalty);

  return {
    templateId: tpl.id,
    score,
    breakdown: {
      required: required.ratio,
      signature: signature.ratio,
      vocabulary: vocabulary.ratio,
      shape: shapeMatch,
      penalty,
    },
    // What the UI shows as "why" - the concrete structural evidence, deduped and capped.
    evidence: [...required.hits, ...signature.hits, ...vocabulary.hits].slice(0, 6),
    conflicts: negative.hits,
  };
}

export function scoreAll(doc) {
  return TEMPLATES.map((t) => scoreTemplate(doc, t)).sort((a, b) => b.score - a.score);
}

/**
 * Confidence blends absolute match strength with how far clear the runner-up is.
 * A strong match that a second template almost equals is NOT a confident match - that is
 * precisely the case the confirm/correct step exists for.
 */
function confidenceOf(best, runnerUp) {
  const margin = best.score - (runnerUp?.score ?? 0);
  const clarity = Math.min(1, margin / 0.22);
  return Math.max(0, Math.min(0.99, best.score * (0.62 + 0.38 * clarity)));
}

/**
 * Classify a batch as a SET rather than file by file.
 *
 * The five source types are distinct, so an upload of five files is an assignment problem,
 * not five independent guesses. Resolving it jointly rescues genuinely ambiguous files: a
 * scruffy spreadsheet lands on "Excel tracker" because the BaNCS slot is already claimed
 * at high confidence by a file that matches it far better.
 */
export function classifyBatch(docs) {
  const scored = docs.map((doc, i) => ({ i, doc, ranked: scoreAll(doc) }));

  const pairs = [];
  for (const s of scored) for (const r of s.ranked) pairs.push({ docIndex: s.i, ...r });
  pairs.sort((a, b) => b.score - a.score);

  const takenDoc = new Set();
  const takenTemplate = new Set();
  const assignment = new Map();

  const oneToOne = docs.length <= TEMPLATES.length;
  if (oneToOne) {
    for (const p of pairs) {
      if (takenDoc.has(p.docIndex) || takenTemplate.has(p.templateId)) continue;
      if (p.score <= 0) continue;
      assignment.set(p.docIndex, p.templateId);
      takenDoc.add(p.docIndex);
      takenTemplate.add(p.templateId);
    }
  }

  return scored.map((s) => {
    const assignedId = assignment.get(s.i) ?? s.ranked[0]?.templateId ?? null;
    const best = s.ranked.find((r) => r.templateId === assignedId) ?? s.ranked[0];
    const independentBest = s.ranked[0];
    const runnerUp = s.ranked.find((r) => r.templateId !== best.templateId);

    // Flag when the set-level resolution overrode this file's own first choice - the user
    // should see that, not have it hidden.
    const overridden = oneToOne && independentBest && independentBest.templateId !== best.templateId;

    const tpl = templateById(best.templateId);
    return {
      sourceId: best.templateId,
      sourceLabel: tpl?.label ?? 'Unrecognised',
      blurb: tpl?.blurb ?? '',
      confidence: overridden ? Math.min(0.78, confidenceOf(best, runnerUp)) : confidenceOf(best, runnerUp),
      score: best.score,
      evidence: best.evidence,
      conflicts: best.conflicts,
      resolvedBySet: overridden,
      ranked: s.ranked.map((r) => ({ sourceId: r.templateId, label: templateById(r.templateId)?.label, score: r.score })),
      method: 'structural',
    };
  });
}
