import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = process.cwd();
const outPath = path.resolve(root, 'exports/copyright-submission.pdf');

const skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.wrangler', '.yarn', '.vscode']);
const includeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json', '.md', '.sql', '.cjs', '.mjs', '.yaml', '.yml', '.toml', '.txt', '.svg', '.sh', '.ps1', '.env']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) files.push(...walk(full));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (includeExts.has(ext) || entry.name === 'README' || entry.name === 'LICENSE') {
        files.push(full);
      }
    }
  }
  return files;
}

function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sanitize(text) {
  const map = {
    '→': '->',
    '←': '<-',
    '•': '*',
    '’': "'",
    '“': '"',
    '”': '"',
    '…': '...',
  };
  let out = '';
  for (const ch of normalize(text)) {
    if (ch in map) {
      out += map[ch];
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) {
      out += ch;
    } else {
      out += '?';
    }
  }
  return out;
}

function renameDocumentationText(text, relPath) {
  const shouldRename = /(^|\\|\/)(README|docs)(\/|$)|\.(md|txt|html)$/i.test(relPath);
  if (!shouldRename) return text;
  return text.replace(/\bClanTek\b/gi, 'mustr');
}

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const raw of normalize(text).split('\n')) {
    const line = raw.replace(/\t/g, '    ');
    if (font.widthOfTextAtSize(line, size) <= maxWidth) {
      lines.push(line);
      continue;
    }
    const words = line.split(/(\s+)/);
    let current = '';
    for (const word of words) {
      if (!word) continue;
      const candidate = current ? current + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function addHeader(page, font, title, pageno, totalPages) {
  const { width, height } = page.getSize();
  page.drawText(title, { x: 40, y: height - 40, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Page ${pageno} of ${totalPages}`, { x: width - 120, y: height - 40, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawLine({ start: { x: 40, y: height - 52 }, end: { x: width - 40, y: height - 52 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
}

async function main() {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const files = walk(root).filter((f) => !f.includes('exports')).sort((a, b) => a.localeCompare(b));
  const pdfDoc = await PDFDocument.create();
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 40;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 12;
  const linesPerPage = 54;

  const cover = pdfDoc.addPage([pageWidth, pageHeight]);
  addHeader(cover, courier, 'Copyright Submission Bundle', 1, 2 + files.length);
  cover.drawText('mustr Project Source Listing', { x: 40, y: 650, size: 24, font: bold, color: rgb(0.08, 0.08, 0.08) });
  cover.drawText(`Generated from ${path.basename(root)}`, { x: 40, y: 610, size: 12, font: courier, color: rgb(0.2, 0.2, 0.2) });
  cover.drawText(`Included files: ${files.length}`, { x: 40, y: 575, size: 12, font: courier, color: rgb(0.2, 0.2, 0.2) });
  cover.drawText('This document contains the source code and project files used for copyright submission.', { x: 40, y: 525, size: 11, font: courier, color: rgb(0.2, 0.2, 0.2) });

  const toc = pdfDoc.addPage([pageWidth, pageHeight]);
  addHeader(toc, courier, 'Table of Contents', 2, 2 + files.length);
  toc.drawText('Files included', { x: 40, y: 700, size: 18, font: bold, color: rgb(0.08, 0.08, 0.08) });
  let y = 660;
  for (const file of files.slice(0, 80)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (y < 80) break;
    toc.drawText(rel, { x: 50, y, size: 8, font: courier, color: rgb(0.2, 0.2, 0.2) });
    y -= 12;
  }

  let pageNumber = 3;
  for (const file of files) {
    const relPath = path.relative(root, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');
    const docText = renameDocumentationText(text, relPath);
    const lines = wrapText(sanitize(docText), courier, 9, maxWidth);

    let currentPage = null;
    let currentY = 0;

    const newPage = () => {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      addHeader(currentPage, courier, relPath, pageNumber, 2 + files.length + Math.ceil(lines.length / linesPerPage));
      pageNumber += 1;
      currentY = pageHeight - 90;
      currentPage.drawText(relPath, { x: 40, y: pageHeight - 78, size: 10, font: bold, color: rgb(0.08, 0.08, 0.08) });
      return currentPage;
    };

    if (!currentPage) newPage();
    for (const line of lines) {
      if (currentY < 60) newPage();
      currentPage.drawText(line, { x: 40, y: currentY, size: 9, font: courier, color: rgb(0.1, 0.1, 0.1) });
      currentY -= lineHeight;
    }
  }

  const bytes = await pdfDoc.save();
  fs.writeFileSync(outPath, bytes);
  const saved = await PDFDocument.load(outPath);
  console.log(`Created ${path.relative(root, outPath)} with ${saved.getPageCount()} pages`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
