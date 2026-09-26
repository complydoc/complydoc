/**
 * A document's reading as one text, ready to diff like a file.
 *
 * Each page opens with a `# Page N` line, so a hunk says which page it is on.
 * Readers break lines in different places, so a line-by-line diff of two
 * readings is mostly line endings; laid out one sentence per line, the only
 * lines that differ are the ones whose words do.
 */
import { findAll } from "./highlight";
import type { FindingRef } from "./route";
import type { DocumentEntry, Evidence, PageText, Report, Severity } from "./types";

export type Layout = "lines" | "sentences";

/** The reading taken as the page's text, as the viewer names it. */
export const KEPT = "kept";
export const OCR = "ocr";

export interface Side {
  /** Position of the document in the report. */
  document: number;
  /** `kept`, `ocr`, or a reader's name from the page's readings. */
  reader: string;
}

export interface ReaderOption {
  id: string;
  label: string;
}

/** Every reading this document carries: the kept one first, OCR last. */
export function readersOf(report: Report, document: DocumentEntry): ReaderOption[] {
  const pages = document.extracted_text;
  const scanned = pages.length > 0 && pages.every((p) => p.source === "ocr");
  const kept = pages.find((p) => p.kept)?.kept || report.run.extractor;
  const options: ReaderOption[] = [{ id: KEPT, label: scanned ? `OCR (kept)` : `${kept} (kept)` }];
  const names = new Set<string>();
  for (const page of pages) for (const name of Object.keys(page.readings)) names.add(name);
  for (const name of names) if (name !== kept) options.push({ id: name, label: name });
  if (!scanned && pages.some((p) => p.ocr_text.trim())) options.push({ id: OCR, label: "OCR" });
  return options;
}

/**
 * Whether this document's text can be shown both ways: the run kept the values
 * (`--reveal`) and a masked copy of every page beside them.
 */
export function canReveal(document: DocumentEntry): boolean {
  return document.extracted_text.length > 0 && document.extracted_text.every((p) => typeof p.masked_text === "string");
}

/** A reading of the page: masked, unless `unmasked` and the report holds the values. */
function pageText(page: PageText, reader: string, unmasked = false): string {
  const covered = !unmasked && typeof page.masked_text === "string";
  if (reader === KEPT) return covered ? (page.masked_text ?? "") : page.text;
  if (reader === OCR) return covered ? (page.masked_ocr_text ?? "") : page.ocr_text;
  return (covered ? page.masked_readings?.[reader] : undefined) ?? page.readings[reader] ?? "";
}

/** One line per line as read, spacing evened out and blank lines dropped. */
function asLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** One sentence per line: the reader's own line breaks are gone, sentence ends are kept. */
function asSentences(text: string): string[] {
  const flowing = text.replace(/\s+/g, " ").trim();
  if (!flowing) return [];
  return flowing
    .split(/(?<=[.!?;:])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

interface PageLines {
  number: number;
  /** The `# Page N` line's number, counting from 1. */
  marker: number;
  lines: string[];
}

function pagesOf(report: Report, side: Side, layout: Layout, unmasked: boolean): PageLines[] {
  const document = report.documents[side.document];
  if (!document) return [];
  let next = 1;
  return document.extracted_text.map((page) => {
    const text = pageText(page, side.reader, unmasked);
    const lines = layout === "sentences" ? asSentences(text) : asLines(text);
    const laid = { number: page.number, marker: next, lines };
    next += 1 + lines.length;
    return laid;
  });
}

/** A document's reading as one text, page by page. With `unmasked`, the values, where the report holds them. */
export function sideText(report: Report, side: Side, layout: Layout, unmasked = false): string {
  const lines = pagesOf(report, side, layout, unmasked).flatMap((page) => [`# Page ${page.number}`, ...page.lines]);
  return `${lines.join("\n")}\n`;
}

/** A finding, placed on a line of one side of the diff. */
export interface LineMark {
  ref: FindingRef;
  page: number | null;
  label: string;
  severity: Severity;
  evidence: Evidence | null;
  /** What the finding reads as on this side: the value as shown, or the start of the passage. */
  text: string;
  /** False when the text could not be found on the page, and the mark sits on the page's own line. */
  placed: boolean;
}

/** Long enough to be found only where it is; short enough to stay within one sentence. */
const PASSAGE_START = 40;

/**
 * Every finding in the document, by the line of this side it is on, counting from 1.
 *
 * A finding is looked for on its own page's lines, spacing aside. One this
 * reader broke across lines, or did not read at all, is put on the page's
 * `# Page N` line, so it is still shown where its page starts.
 */
export function lineMarks(report: Report, side: Side, layout: Layout, unmasked = false): Record<number, LineMark[]> {
  const document = report.documents[side.document];
  if (!document) return {};
  const marks: Record<number, LineMark[]> = {};
  const pages = pagesOf(report, side, layout, unmasked);
  const place = (mark: Omit<LineMark, "placed">, needle: string) => {
    const page = pages.find((p) => p.number === mark.page) ?? pages[0];
    if (!page) return;
    const at = needle.trim() ? page.lines.findIndex((line) => findAll(line, needle).length > 0) : -1;
    const line = at >= 0 ? page.marker + 1 + at : page.marker;
    (marks[line] ??= []).push({ ...mark, placed: at >= 0 });
  };
  document.sensitive.matches.forEach((match, index) => {
    const shown = unmasked ? (match.revealed ?? match.masked) : match.masked;
    place(
      {
        ref: { kind: "identifier", index },
        page: match.page,
        label: match.label,
        severity: match.severity,
        evidence: match.evidence,
        text: shown,
      },
      shown,
    );
  });
  document.content_findings.forEach((finding, index) => {
    const start = finding.excerpt.replace(/…$/, "").slice(0, PASSAGE_START);
    place(
      {
        ref: { kind: "hidden", index },
        page: finding.page,
        label: "Hidden instruction",
        severity: finding.severity,
        evidence: null,
        text: finding.excerpt,
      },
      start,
    );
  });
  return marks;
}

/** What a side is called in the diff's header: its reader, the document being the one on screen. */
export function sideName(report: Report, side: Side): string {
  const document = report.documents[side.document];
  const reader = document ? readersOf(report, document).find((r) => r.id === side.reader)?.label : undefined;
  return reader ?? side.reader;
}

/** What to compare on opening: the kept reading against the next reader, or OCR. The same document either way. */
export function defaultSides(report: Report, index: number): [Side, Side] {
  const document = report.documents[index];
  const base: Side = { document: index, reader: KEPT };
  const other = document ? readersOf(report, document)[1] : undefined;
  return [base, { document: index, reader: other?.id ?? KEPT }];
}
