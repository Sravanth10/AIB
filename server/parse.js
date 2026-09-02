import ExcelJS from 'exceljs';
import { PDFParse } from 'pdf-parse';

/**
 * Turns any uploaded file into one shape the rest of the pipeline understands:
 *
 *   { ext, shape, sheets[], lines[], text, headerRow, headers[] }
 *
 * `text` is a normalised, lowercased haystack used for vocabulary matching and month
 * detection. Cell dates are stringified into it as ISO, so an .xlsx with real date cells
 * still contributes date evidence.
 */

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export const normalise = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9%\s.:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cellText = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.formula) return '';
  }
  return String(v);
};

/** Rows that look like a header: mostly short, non-numeric, distinct labels. */
function scoreHeaderRow(row) {
  const cells = row.filter((c) => String(c).trim() !== '');
  if (cells.length < 3) return 0;
  const labelish = cells.filter((c) => {
    const s = String(c).trim();
    return s.length > 1 && s.length < 40 && !/^-?\d+([.,]\d+)?$/.test(s) && !/^\d{4}-\d{2}-\d{2}/.test(s);
  });
  const distinct = new Set(cells.map((c) => String(c).trim().toLowerCase())).size;
  return (labelish.length / cells.length) * Math.min(1, distinct / 4) * cells.length;
}

/**
 * Locate the header row inside a grid. The manual tracker puts it on row 5 behind a merged
 * title block, so we cannot assume row 1 - we score the first 20 rows and take the best.
 */
export function findHeaderRow(rows, limit = 20) {
  let best = { index: -1, score: 0 };
  for (let i = 0; i < Math.min(limit, rows.length); i++) {
    const score = scoreHeaderRow(rows[i]);
    if (score > best.score) best = { index: i, score };
  }
  return best.index;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets = wb.worksheets.map((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(vals.map(cellText));
    });
    return { name: ws.name, rows };
  });
  return { sheets, shape: 'grid' };
}

function parseCsv(buffer) {
  const rows = buffer
    .toString('utf8')
    .split(/\r?\n/)
    .map(parseCsvLine);
  return { sheets: [{ name: 'csv', rows }], shape: 'grid' };
}

async function parsePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const res = await parser.getText();
    const lines = res.text.split(/\r?\n/).map((l) => l.trim());
    // An email thread announces itself with header blocks; anything else we treat as tabular.
    const headerBlocks = (res.text.match(/^\s*(from|sent|to|subject):/gim) || []).length;
    return { lines, pages: res.total, shape: headerBlocks >= 3 ? 'prose-pdf' : 'tabular-pdf' };
  } finally {
    await parser.destroy();
  }
}

export async function parseFile(buffer, filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let parsed;
  if (ext === 'xlsx' || ext === 'xls') parsed = await parseXlsx(buffer);
  else if (ext === 'csv' || ext === 'txt') parsed = parseCsv(buffer);
  else if (ext === 'pdf') parsed = await parsePdf(buffer);
  else throw new Error(`Unsupported file type: .${ext}`);

  const sheets = parsed.sheets || [];
  const lines = parsed.lines || sheets.flatMap((s) => s.rows.map((r) => r.join(' ')));

  // Header discovery across every sheet, so a stray "Sheet1" cannot hide the real grid.
  let headerRow = null;
  let headers = [];
  for (const sheet of sheets) {
    const idx = findHeaderRow(sheet.rows);
    if (idx < 0) continue;
    const candidate = sheet.rows[idx].map((c) => String(c).trim()).filter(Boolean);
    if (candidate.length > headers.length) {
      headers = candidate;
      headerRow = { sheet: sheet.name, index: idx };
    }
  }

  let shape = parsed.shape;
  if (shape === 'grid' && headerRow && headerRow.index > 0) shape = 'grid-offset-header';

  const text = normalise([...lines, ...headers].join(' \n '));

  return {
    ext,
    shape,
    sheets,
    lines,
    text,
    headerRow,
    headers,
    normalisedHeaders: headers.map(normalise),
    pages: parsed.pages,
  };
}

/**
 * Reporting month from CONTENT, never the filename. Every source carries its period
 * internally, so we count every month reference - named ("August 2026", "Aug 2026") and
 * ISO ("2026-08-14") - and take the most frequent. A file whose dominant month is not the
 * one being generated gets flagged rather than silently mis-filed.
 */
export function detectMonth(doc) {
  const counts = new Map();
  const bump = (key, n = 1) => counts.set(key, (counts.get(key) || 0) + n);

  const named = doc.text.matchAll(/\b([a-z]{3,9})\s+(\d{4})\b/g);
  for (const m of named) {
    const idx = MONTH_NAMES.findIndex((n) => n === m[1] || n.slice(0, 3) === m[1]);
    if (idx >= 0) bump(`${m[2]}-${String(idx + 1).padStart(2, '0')}`, 3);
  }

  const iso = doc.text.matchAll(/\b(\d{4})-(\d{2})-\d{2}\b/g);
  for (const m of iso) bump(`${m[1]}-${m[2]}`);

  if (!counts.size) return null;
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { month: best[0], evidence: best[1], all: Object.fromEntries(counts) };
}
