// @ts-check
/**
 * Builds docs/CareConnect-Documentation.docx from docs/DOCUMENTATION.md, with the
 * diagram images from docs/diagrams/web and an appendix of screenshots.
 *
 * Usage: npm run docs:images && npm run docs:word
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableOfContents, TableRow, TextRun, WidthType,
} from 'docx';

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '..', '..', 'docs');
const markdown = fs.readFileSync(path.join(docs, 'DOCUMENTATION.md'), 'utf8').replace(/\r\n/g, '\n');

const FONT = 'Calibri';
const MONO = 'Consolas';
const TEAL = '0D6B62';
const CONTENT_WIDTH = 9360; // US Letter with 1-inch margins, in DXA
const MAX_IMAGE_WIDTH = 624; // px at 96 dpi = 6.5 in
const MAX_IMAGE_HEIGHT = 820;

/** Width and height of a PNG from its header. @param {Buffer} png */
function pngSize(png) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** @param {string} file @param {number} [maxWidth] */
function image(file, maxWidth = MAX_IMAGE_WIDTH) {
  const data = fs.readFileSync(file);
  const { width, height } = pngSize(data);
  const scale = Math.min(1, maxWidth / width, MAX_IMAGE_HEIGHT / height);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true, // keep the image with its caption
    spacing: { before: 120, after: 60 },
    children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(width * scale), height: Math.round(height * scale) } })],
  });
}

/** @param {string} text */
function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text, italics: true, size: 18, color: '555555', font: FONT })],
  });
}

/**
 * Inline Markdown: **bold**, `code`, _italic_, [text](url).
 *
 * @param {string} text
 * @param {{ bold?: boolean, size?: number, color?: string }} [base]
 */
function runs(text, base = {}) {
  const out = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|_[^_\s][^_]*_)/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    const token = m[0];
    if (token.startsWith('**')) out.push(new TextRun({ text: token.slice(2, -2), bold: true, font: FONT, ...base, ...(base.bold ? {} : {}) }));
    else if (token.startsWith('`')) out.push(new TextRun({ text: token.slice(1, -1), font: MONO, size: (base.size ?? 21) - 2, color: base.color ?? '1F4E4A' }));
    else if (token.startsWith('[')) out.push(new TextRun({ text: /\[([^\]]+)\]/.exec(token)?.[1] ?? token, font: FONT, ...base }));
    else out.push(new TextRun({ text: token.slice(1, -1), italics: true, font: FONT, ...base }));
    last = m.index + token.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return out;
}

/** @param {string} line */
function cells(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** @param {string[]} lines */
function table(lines) {
  const header = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  const columns = header.length;
  // Wider columns for longer content.
  const lengths = header.map((_, i) => Math.max(header[i].length, ...body.map((r) => (r[i] ?? '').length)));
  const weights = lengths.map((l) => Math.min(Math.max(l, 16), 90));
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.floor((w / total) * CONTENT_WIDTH));
  // Every column gets at least ~0.95 inch so short words never break; the widest columns give up the room.
  const MIN = Math.min(1360, Math.floor(CONTENT_WIDTH / columns));
  for (let i = 0; i < columns; i += 1) {
    if (widths[i] < MIN) {
      const need = MIN - widths[i];
      widths[i] = MIN;
      widths[widths.indexOf(Math.max(...widths))] -= need;
    }
  }
  widths[columns - 1] += CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9CFCB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const makeRow = (/** @type {string[]} */ row, /** @type {boolean} */ head) => new TableRow({
    tableHeader: head,
    cantSplit: true,
    children: row.map((text, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      borders,
      shading: head ? { type: ShadingType.CLEAR, fill: 'E0EFEC', color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: runs(text, { size: 19, bold: head || undefined }) })],
    })),
  });
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [makeRow(header, true), ...body.map((r) => makeRow(r, false))],
  });
}

/** Image file for a Mermaid block, from the heading it sits under. @param {string} heading */
function diagramFor(heading) {
  const dir = path.join(docs, 'diagrams', 'web');
  if (heading.startsWith('3.')) return path.join(dir, 'fig0-architecture.png');
  const n = /^4\.(\d)/.exec(heading)?.[1];
  const file = n ? fs.readdirSync(dir).find((f) => f.startsWith(`fig${n}-`)) : undefined;
  return file ? path.join(dir, file) : undefined;
}

/** Converts the Markdown body into document elements. */
function convert() {
  /** @type {(Paragraph | Table)[]} */
  const out = [];
  const lines = markdown.split('\n');
  let heading = '';
  let figure = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('# ') || line === '---' || line.trim() === '') continue;
    if (line.startsWith('**Object-Oriented') || line.startsWith('Laguna State')) continue; // on the cover page
    if (/^\| Group Members/.test(line)) { // group table goes on the cover page
      while (lines[i + 1]?.startsWith('|')) i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      heading = line.slice(3).replace(/^\d+\.\s*/, (m) => m);
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !line.startsWith('## 1.'), children: runs(line.slice(3)) }));
      continue;
    }
    if (line.startsWith('### ')) {
      heading = line.slice(4);
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs(line.slice(4)) }));
      continue;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const block = [];
      while (i + 1 < lines.length && !lines[i + 1].startsWith('```')) block.push(lines[++i]);
      i += 1;
      if (lang === 'mermaid') {
        const file = diagramFor(heading.replace(/^(\d+)\.\s/, '$1.'));
        if (file && fs.existsSync(file)) {
          figure += 1;
          out.push(image(file));
          out.push(caption(`Figure ${figure}. ${heading.replace(/^[\d.]+\s*/, '')}`));
        }
      } else {
        for (const codeLine of block) {
          out.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: 'F2F4F2', color: 'auto' }, spacing: { after: 0 },
            children: [new TextRun({ text: codeLine || ' ', font: MONO, size: 18 })] }));
        }
        out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      }
      continue;
    }
    if (line.startsWith('|')) {
      const block = [line];
      while (lines[i + 1]?.startsWith('|')) block.push(lines[++i]);
      out.push(table(block));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }
    if (line.startsWith('> ')) {
      const block = [line.slice(2)];
      while (lines[i + 1]?.startsWith('> ')) block.push(lines[++i].slice(2));
      out.push(new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: 'FCF1DE', color: 'auto' },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'C98A1B', space: 8 } },
        spacing: { before: 120, after: 160 },
        children: runs(block.join(' '), { size: 20 }),
      }));
      continue;
    }
    const bullet = /^(\s*)- (.*)$/.exec(line);
    if (bullet) {
      let text = bullet[2];
      // Join wrapped continuation lines that belong to this bullet.
      while (lines[i + 1] && /^s{2,}S/.test(lines[i + 1]) && !/^s*(- |d+. )/.test(lines[i + 1])) text += ` ${lines[++i].trim()}`;
      out.push(new Paragraph({ numbering: { reference: 'bullets', level: bullet[1].length >= 2 ? 1 : 0 }, spacing: { after: 60 }, children: runs(text) }));
      continue;
    }
    const numbered = /^(\s*)\d+\. (.*)$/.exec(line);
    if (numbered) {
      out.push(new Paragraph({ numbering: { reference: `numbers-${heading}`, level: 0 }, spacing: { after: 60 }, children: runs(numbered[2]) }));
      continue;
    }
    // Plain paragraph: join soft-wrapped lines.
    const para = [line];
    while (lines[i + 1] && !/^(#|\||>|```|\s*- |\s*\d+\. |---)/.test(lines[i + 1]) && lines[i + 1].trim() !== '') para.push(lines[++i]);
    out.push(new Paragraph({ spacing: { after: 140 }, children: runs(para.join(' ')) }));
  }
  return { out, headings: [...markdown.matchAll(/^### (.*)$|^## (.*)$/gm)].map((m) => m[1] ?? m[2]) };
}

function cover() {
  const group = /\| Group Members[^\n]*\n\|[-| ]+\|\n((?:\|[^\n]*\n)+)/.exec(markdown)?.[1].trim().split('\n').map(cells) ?? [];
  return [
    new Paragraph({ spacing: { before: 2200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'CareConnect', bold: true, size: 64, color: TEAL, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Clinic Appointment Management System', size: 36, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'JavaScript Web Version', size: 28, color: '555555', font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Object-Oriented Programming Final Project', size: 24, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Scenario 3: Clinic Appointment Management System', size: 24, font: FONT })] }),
    table(['| Group Members | Role / Contribution |', '|---|---|', ...group.map((r) => `| ${r.join(' | ')} |`)]),
    new Paragraph({ spacing: { before: 800 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Laguna State Polytechnic University', size: 24, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', timeZone: 'Asia/Manila' }), size: 22, color: '555555', font: FONT })] }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: 'Contents', bold: true, size: 34, color: TEAL, font: FONT })] }),
    new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function screenshots() {
  const dir = path.join(docs, 'screenshots', 'web');
  const list = [
    ['login', 'Sign-in page with the demo accounts'],
    ['dashboard', 'Dashboard: counts, today\'s schedule and staff on duty'],
    ['dashboard-full', 'Dashboard: on-duty timeline and charts'],
    ['appointments', 'Appointments with status and period filters'],
    ['book-appointment', 'Booking only offers open slots and shows the fee estimate'],
    ['appointment-details', 'Appointment details (visit summary) with print option'],
    ['calendar', 'Calendar: week view for one staff member'],
    ['patients', 'Patients'],
    ['patient-profile', 'Patient profile with visit timeline and findings'],
    ['medical-staff', 'Medical staff with the polymorphic details line'],
    ['records', 'Appointment records with totals and CSV export'],
    ['audit-log', 'Audit log'],
    ['accounts', 'Accounts: the administrator manages who can sign in'],
    ['queue-board', 'Waiting-room queue board (ticket numbers and initials only)'],
    ['dashboard-dark', 'Dark theme'],
    ['phone-appointments', 'Phone layout'],
  ];
  /** @type {Paragraph[]} */
  const out = [new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: 'Appendix: Screenshots', font: FONT })] })];
  list.forEach(([file, text], i) => {
    const full = path.join(dir, `${file}.png`);
    if (!fs.existsSync(full)) return;
    out.push(image(full, file.startsWith('phone') ? 260 : MAX_IMAGE_WIDTH));
    out.push(caption(`Screenshot ${i + 1}. ${text}`));
  });
  return out;
}

const { out: body, headings } = convert();
const numberedRefs = [...new Set(headings.map((h) => `numbers-${h}`))];

const doc = new Document({
  creator: 'CareConnect project team',
  title: 'CareConnect: Clinic Appointment Management System (JavaScript Web Version)',
  styles: {
    default: { document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 276 } } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 34, bold: true, color: TEAL }, paragraph: { spacing: { before: 240, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 26, bold: true, color: '1F3B37' }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 270 } } } },
      ] },
      ...numberedRefs.map((reference) => ({ reference, levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } },
      ] })),
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: 'CareConnect · Page ', size: 16, color: '777777', font: FONT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '777777', font: FONT }),
      ] })] }),
    },
    children: [...cover(), ...body, ...screenshots()],
  }],
});

const target = path.join(docs, 'CareConnect-Documentation.docx');
fs.writeFileSync(target, await Packer.toBuffer(doc));
console.info(`Wrote ${path.relative(path.resolve(docs, '..'), target)}`);
