import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const MARGIN = 40;

export function createDoc(filePath, opts = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, ...opts });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  const done = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  return { doc, done };
}

export async function finish(doc, done) {
  doc.end();
  await done;
}

const bottom = (doc) => doc.page.height - MARGIN - 24;

/**
 * Fixed-column table renderer with automatic page breaks and repeated headers.
 * columns: [{ key, label, width, align?, format? }]
 */
export function table(doc, { columns, rows, fontSize = 7.5, rowHeight = 14, zebra = true }) {
  const totalWidth = columns.reduce((a, c) => a + c.width, 0);
  const startX = MARGIN;

  const drawHeader = () => {
    const y = doc.y;
    doc.save().rect(startX, y, totalWidth, rowHeight + 2).fill('#e8edf4').restore();
    let x = startX;
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#1f2d3d');
    for (const c of columns) {
      doc.text(c.label, x + 4, y + 5, { width: c.width - 8, align: c.align || 'left', lineBreak: false });
      x += c.width;
    }
    doc.y = y + rowHeight + 2;
  };

  drawHeader();

  rows.forEach((row, i) => {
    if (doc.y + rowHeight > bottom(doc)) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (zebra && i % 2 === 1) {
      doc.save().rect(startX, y, totalWidth, rowHeight).fill('#f6f8fb').restore();
    }
    let x = startX;
    doc.font('Helvetica').fontSize(fontSize).fillColor('#22303f');
    for (const c of columns) {
      const raw = row[c.key];
      const val = c.format ? c.format(raw, row) : raw ?? '';
      doc.fillColor(c.color ? c.color(raw, row) : '#22303f');
      doc.text(String(val), x + 4, y + 4, { width: c.width - 8, align: c.align || 'left', lineBreak: false });
      x += c.width;
    }
    doc.fillColor('#22303f');
    doc.y = y + rowHeight;
  });

  doc.moveDown(0.5);
}

export function rule(doc, color = '#c9d4e2') {
  const y = doc.y + 2;
  doc.save().moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).lineWidth(0.7).stroke(color).restore();
  doc.y = y + 8;
}

export function keyValueBlock(doc, pairs, { columns = 2, fontSize = 8 } = {}) {
  const colWidth = (doc.page.width - MARGIN * 2) / columns;
  const startY = doc.y;
  pairs.forEach(([k, v], i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = MARGIN + col * colWidth;
    const y = startY + row * (fontSize + 6);
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#5b6b7d').text(`${k}: `, x, y, { continued: true, lineBreak: false });
    doc.font('Helvetica').fillColor('#22303f').text(String(v), { lineBreak: false });
  });
  doc.y = startY + Math.ceil(pairs.length / columns) * (fontSize + 6) + 6;
}

export const PAGE_WIDTH = 595.28 - MARGIN * 2;
export { MARGIN };
