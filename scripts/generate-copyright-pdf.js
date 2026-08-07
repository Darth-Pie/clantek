import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = process.cwd();
const outputPath = path.resolve(root, 'exports/copyright-submission.pdf');

const excludedDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.wrangler',
  '.yarn',
  '.vscode',
]);

const includedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.html',
  '.json',
  '.md',
  '.sql',
  '.cjs',
  '.mjs',
  '.yaml',
  '.yml',
  '.toml',
  '.txt',
  '.svg',
  '.sh',
  '.ps1',
  '.env',
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      if (entry.name === '.git' || entry.name === '.vscode') continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) {
        files.push(...walk(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (includedExtensions.has(ext) || entry.name === 'README' || entry.name === 'LICENSE') {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sanitizeText(text) {
  return normalizeLineEndings(text)
    .replace(/\t/g, '    ')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/•/g, '*')
    .replace(/’/g, "'")
    .replace(/“/g, '"')
    .replace(/”/g, '"')
    .replace(/…/g, '...')
    .replace(/\u0000/g, '')
    .replace(/[^	

0-]/g, '?');
}

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const rawLine of normalizeLineEndings(text).split('\n')) {
    const line = rawLine.replace(/\t/g, '    ');
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
        if (current) {
          lines.push(current);
        }
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function addPageWithHeader(doc, page, font, fontSize, title, pageNumber, totalPages) {
  const { width, height } = page.getSize();
  page.drawText(title, {
    x: 40,
    y: height - 40,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText(`Page ${pageNumber} of ${totalPages}`, {
    x: width - 120,
    y: height - 40,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawLine({
    start: { x: 40, y: height - 52 },
    end: { x: width - 40, y: height - 52 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  page.drawText('Generated for copyright submission', {
    x: 40,
    y: height - 60,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
}

async function main() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const files = walk(root)
    .filter((file) => !file.includes('\\exports\\'))
    .sort((a, b) => a.localeCompare(b));

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Courier);
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageHeight = 792;
  const pageWidth = 612;
  const margin = 40;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 12;
  const maxLines = 54;

  const coverPage = pdfDoc.addPage([pageWidth, pageHeight]);
  addPageWithHeader(pdfDoc, coverPage, font, 10, 'Copyright Submission Bundle', 1, 1);
  coverPage.drawText('mustr Project Source Listing', {
    x: 40,
    y: 650,
    size: 24,
    font: titleFont,
    color: rgb(0.08, 0.08, 0.08),
  });
  coverPage.drawText(`Generated from ${path.basename(root)}`, {
    x: 40,
    y: 610,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  coverPage.drawText(`Included files: ${files.length}`, {
    x: 40,
    y: 575,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  coverPage.drawText('This document contains the source code and project files used for copyright submission.', {
    x: 40,
    y: 525,
    size: 11,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  coverPage.drawText('Generated automatically by scripts/generate-copyright-pdf.js', {
    x: 40,
    y: 480,
    size: 10,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });

  const tocPage = pdfDoc.addPage([pageWidth, pageHeight]);
  addPageWithHeader(pdfDoc, tocPage, font, 10, 'Table of Contents', 2, 2 + files.length);
  tocPage.drawText('Files included', {
    x: 40,
    y: 700,
    size: 18,
    font: titleFont,
    color: rgb(0.08, 0.08, 0.08),
  });
  let y = 660;
  for (const file of files.slice(0, 40)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const line = `${rel}`;
    if (y < 80) break;
    tocPage.drawText(line, {
      x: 50,
      y,
      size: 8,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 12;
  }

  let pageNumber = 3;
  for (const file of files) {
    const relPath = path.relative(root, file).replace(/\\/g, '/');
    const contents = fs.readFileSync(file, 'utf8');

    const lines = wrapText(sanitizeText(contents), font, 9, maxWidth);
    let currentPage = null;
    let currentY = 0;
    const addNewPage = () => {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      addPageWithHeader(pdfDoc, page, font, 10, relPath, pageNumber, 2 + files.length + Math.ceil(lines.length / maxLines));
      pageNumber += 1;
      currentPage = page;
      currentY = pageHeight - 90;
      currentPage.drawText(relPath, {
        x: 40,
        y: pageHeight - 78,
        size: 10,
        font: titleFont,
        color: rgb(0.08, 0.08, 0.08),
      });
      return page;
    };

    if (!currentPage) addNewPage();

    for (const line of lines) {
      if (currentY < 60) {
        addNewPage();
      }
      currentPage.drawText(line, {
        x: 40,
        y: currentY,
        size: 9,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      currentY -= lineHeight;
    }
  }

  const bytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, bytes);
  const savedPdf = await PDFDocument.load(outputPath);
  console.log(`Created ${path.relative(root, outputPath)} with ${savedPdf.getPageCount()} pages`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
