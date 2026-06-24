// Parsers for various uploaded file formats — converts them into the
// unified { sheet, data } row shape used by the dataset_rows table.
import * as XLSX from "xlsx";
import mammoth from "mammoth";

export type ParsedRow = { sheet: string; data: Record<string, any> };
export type ParseResult = { rows: ParsedRow[]; columns: string[] };

const isSpreadsheet = (name: string) => /\.(xlsx|xls|csv)$/i.test(name);
const isPdf = (name: string) => /\.pdf$/i.test(name);
const isDoc = (name: string) => /\.(docx|doc)$/i.test(name);

/** Split long text into ~500-word chunks so each row is digestible by the AI. */
function chunkText(text: string, wordsPerChunk = 400): string[] {
  const cleaned = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];
  // Prefer paragraph boundaries
  const paragraphs = cleaned.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf: string[] = [];
  let count = 0;
  for (const p of paragraphs) {
    const w = p.split(/\s+/).length;
    if (count + w > wordsPerChunk && buf.length > 0) {
      chunks.push(buf.join("\n\n"));
      buf = [];
      count = 0;
    }
    buf.push(p);
    count += w;
  }
  if (buf.length) chunks.push(buf.join("\n\n"));
  return chunks;
}

async function parseSpreadsheet(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const rows: ParsedRow[] = [];
  const cols = new Set<string>();
  for (const sn of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], {
      header: 1,
      defval: null,
      raw: false,
      blankrows: false,
    });
    const parsedSheet = normalizeSheetRows(aoa);
    for (const row of parsedSheet) {
      for (const key of Object.keys(row)) cols.add(key);
      rows.push({ sheet: sn, data: row });
    }
  }
  return { rows, columns: Array.from(cols) };
}

const isBlankCell = (value: unknown) => value === null || value === undefined || String(value).trim() === "";
const cleanCell = (value: unknown) => isBlankCell(value) ? null : String(value).trim();

function uniqueColumnName(base: string, seen: Map<string, number>) {
  const key = base.trim() || "column";
  const count = seen.get(key) ?? 0;
  seen.set(key, count + 1);
  return count === 0 ? key : `${key}_${count + 1}`;
}

function normalizeHeader(value: unknown, index: number, fallbackPrefix = "column") {
  const text = cleanCell(value);
  if (!text) return `${fallbackPrefix}_${index + 1}`;
  return text
    .replace(/\s+/g, " ")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || `${fallbackPrefix}_${index + 1}`;
}

function trimSheet(aoa: any[][]) {
  const rows = aoa
    .map((row) => (Array.isArray(row) ? row.map(cleanCell) : []))
    .filter((row) => row.some((cell) => !isBlankCell(cell)));
  let maxCol = 0;
  for (const row of rows) {
    for (let i = row.length - 1; i >= 0; i--) {
      if (!isBlankCell(row[i])) {
        maxCol = Math.max(maxCol, i + 1);
        break;
      }
    }
  }
  return rows.map((row) => row.slice(0, maxCol));
}

function nonEmptyCount(row: unknown[]) {
  return row.filter((cell) => !isBlankCell(cell)).length;
}

function detectHeaderRow(rows: unknown[][]) {
  const scan = rows.slice(0, Math.min(rows.length, 25));
  let best = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < scan.length; i++) {
    const row = scan[i];
    const filled = nonEmptyCount(row);
    if (filled < 2) continue;
    const values = row.filter((cell) => !isBlankCell(cell)).map(String);
    const unique = new Set(values.map((value) => value.toLowerCase())).size;
    const avgNextFilled = rows.slice(i + 1, i + 6).reduce((sum, next) => sum + nonEmptyCount(next), 0) / Math.max(1, Math.min(5, rows.length - i - 1));
    const longTextPenalty = values.filter((value) => value.length > 80).length * 2;
    const duplicatePenalty = (values.length - unique) * 2;
    const score = filled * 3 + unique + Math.min(avgNextFilled, filled) - longTextPenalty - duplicatePenalty - i * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best;
}

function normalizeSheetRows(aoa: any[][]): Record<string, any>[] {
  const rows = trimSheet(aoa);
  if (rows.length === 0) return [];

  const maxFilled = Math.max(...rows.map(nonEmptyCount));
  const mostlyKeyValue = maxFilled <= 2;
  const headerIndex = mostlyKeyValue ? -1 : detectHeaderRow(rows);
  const seen = new Map<string, number>();
  const headers = headerIndex >= 0
    ? rows[headerIndex].map((cell, index) => uniqueColumnName(normalizeHeader(cell, index), seen))
    : Array.from({ length: Math.max(2, rows.reduce((max, row) => Math.max(max, row.length), 0)) }, (_, index) =>
        mostlyKeyValue
          ? (index === 0 ? "label" : index === 1 ? "value" : `value_${index}`)
          : `column_${index + 1}`,
      );

  const dataRows = rows.slice(headerIndex >= 0 ? headerIndex + 1 : 0);
  return dataRows.flatMap((row, rowIndex) => {
    const data: Record<string, any> = {};
    row.forEach((value, index) => {
      if (isBlankCell(value)) return;
      const key = headers[index] ?? `column_${index + 1}`;
      data[key] = value;
    });
    if (Object.keys(data).length === 0) return [];
    data.source_row = headerIndex >= 0 ? headerIndex + rowIndex + 2 : rowIndex + 1;
    return [data];
  });
}

async function parsePdf(file: File): Promise<ParseResult> {
  // Lazy-load pdfjs and configure worker
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const rows: ParsedRow[] = [];
  const sheetName = file.name.replace(/\.pdf$/i, "");

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    const chunks = chunkText(text);
    if (chunks.length === 0 && text.trim()) chunks.push(text.trim());
    chunks.forEach((chunk, idx) => {
      rows.push({
        sheet: sheetName,
        data: {
          page: p,
          chunk: idx + 1,
          source: file.name,
          content: chunk,
        },
      });
    });
  }
  return { rows, columns: ["page", "chunk", "source", "content"] };
}

async function parseDoc(file: File): Promise<ParseResult> {
  if (/\.doc$/i.test(file.name)) {
    throw new Error("Legacy .doc files are not supported. Please save as .docx and try again.");
  }
  const buf = await file.arrayBuffer();
  const { value: text } = await mammoth.extractRawText({ arrayBuffer: buf });
  const chunks = chunkText(text);
  const sheetName = file.name.replace(/\.docx$/i, "");
  const rows: ParsedRow[] = chunks.map((chunk, idx) => ({
    sheet: sheetName,
    data: {
      chunk: idx + 1,
      source: file.name,
      content: chunk,
    },
  }));
  return { rows, columns: ["chunk", "source", "content"] };
}

export async function parseUploadedFile(file: File): Promise<ParseResult> {
  if (isSpreadsheet(file.name)) return parseSpreadsheet(file);
  if (isPdf(file.name)) return parsePdf(file);
  if (isDoc(file.name)) return parseDoc(file);
  throw new Error("Unsupported file type. Use .xlsx, .xls, .csv, .pdf, or .docx");
}

export const ACCEPTED_FILE_TYPES = ".xlsx,.xls,.csv,.pdf,.docx";

// ---------- Document-oriented parsers (for /documents + /document_chunks) ----------

export type DocumentChunk = {
  page_number: number | null;
  chunk_index: number;
  content: string;
  section_title?: string | null;
};

export type DocumentParseResult = {
  total_pages: number;
  chunks: DocumentChunk[];
};

export const isDocumentFile = (name: string) => isPdf(name) || isDoc(name);
export const isSpreadsheetFile = (name: string) => isSpreadsheet(name);

/** Render a pdf.js page to a canvas and return a data URL for OCR. */
async function renderPageToCanvas(page: any, scale = 2): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

let _ocrWorker: any = null;
async function getOcrWorker() {
  if (_ocrWorker) return _ocrWorker;
  const Tesseract: any = await import("tesseract.js");
  // English + Filipino (Tagalog). Falls back gracefully if fil pack unavailable.
  try {
    _ocrWorker = await Tesseract.createWorker(["eng", "fil"]);
  } catch {
    _ocrWorker = await Tesseract.createWorker("eng");
  }
  return _ocrWorker;
}

export async function terminateOcrWorker() {
  if (_ocrWorker) {
    try { await _ocrWorker.terminate(); } catch { /* ignore */ }
    _ocrWorker = null;
  }
}

export type DocumentParseProgress = {
  stage: "extracting" | "ocr" | "done";
  current: number;
  total: number;
};

export async function parsePdfAsDocument(
  file: File,
  onProgress?: (p: DocumentParseProgress) => void,
): Promise<DocumentParseResult> {
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const chunks: DocumentChunk[] = [];
  let globalIdx = 0;

  // Pass 1: try embedded text layer per page.
  type PageText = { p: number; text: string; needsOcr: boolean; page: any };
  const pageTexts: PageText[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress?.({ stage: "extracting", current: p, total: pdf.numPages });
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ").trim();
    pageTexts.push({ p, text, needsOcr: text.length < 20, page });
  }

  const ocrPages = pageTexts.filter((pt) => pt.needsOcr);

  // Pass 2: OCR pages with no text layer.
  if (ocrPages.length > 0) {
    const worker = await getOcrWorker();
    let done = 0;
    for (const pt of ocrPages) {
      onProgress?.({ stage: "ocr", current: ++done, total: ocrPages.length });
      try {
        const canvas = await renderPageToCanvas(pt.page, 2);
        const { data } = await worker.recognize(canvas);
        pt.text = (data?.text ?? "").trim();
      } catch (err) {
        console.error(`OCR failed on page ${pt.p}:`, err);
      }
    }
  }

  // Build chunks preserving page numbers.
  for (const pt of pageTexts) {
    if (!pt.text) continue;
    const pieces = chunkText(pt.text);
    if (pieces.length === 0) pieces.push(pt.text);
    for (const piece of pieces) {
      chunks.push({ page_number: pt.p, chunk_index: globalIdx++, content: piece });
    }
  }

  onProgress?.({ stage: "done", current: pdf.numPages, total: pdf.numPages });
  return { total_pages: pdf.numPages, chunks };
}

export async function parseDocxAsDocument(file: File): Promise<DocumentParseResult> {
  if (/\.doc$/i.test(file.name)) {
    throw new Error("Legacy .doc files are not supported. Please save as .docx and try again.");
  }
  const buf = await file.arrayBuffer();
  const { value: text } = await mammoth.extractRawText({ arrayBuffer: buf });
  const pieces = chunkText(text);
  const chunks: DocumentChunk[] = pieces.map((content, i) => ({
    page_number: null,
    chunk_index: i,
    content,
  }));
  return { total_pages: 0, chunks };
}

export async function parseFileAsDocument(
  file: File,
  onProgress?: (p: DocumentParseProgress) => void,
): Promise<DocumentParseResult> {
  if (isPdf(file.name)) return parsePdfAsDocument(file, onProgress);
  if (isDoc(file.name)) return parseDocxAsDocument(file);
  throw new Error("Not a document file (use .pdf or .docx)");
}
