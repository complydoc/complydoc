/**
 * The readings of one page, and how two of them differ.
 *
 * A page can be read several ways: the text layer by the extractor the run
 * kept, by other extractors or loaders it compared, and by OCR. Setting two
 * side by side, with what one has and the other lacks marked, is how a person
 * sees what a reader did to a page.
 */
import { diffWordsWithSpace } from "diff";
import type { PageText } from "./types";

export interface Reading {
  /** Stable id for a picker: the reader's name, or "ocr". */
  id: string;
  label: string;
  text: string;
  /** The reading the report's findings were built from. */
  kept: boolean;
}

export const OCR_ID = "ocr";

/**
 * Every distinct reading of a page, the kept one first and OCR last.
 *
 * `kept` names the reader the run was built from. A scanned page's kept text
 * is OCR's, whatever that reader was, so it is named OCR, and the copies of it
 * the report also carries are left out.
 */
export function pageReadings(page: PageText, kept: string): Reading[] {
  const scanned = page.source === "ocr";
  const readings: Reading[] = [{ id: kept, label: scanned ? "OCR" : kept, text: page.text, kept: true }];
  for (const [name, text] of Object.entries(page.readings)) {
    if (name === kept || (scanned && text === page.text)) continue;
    readings.push({ id: name, label: name, text, kept: false });
  }
  if (page.ocr_text.trim() && !scanned) {
    readings.push({ id: OCR_ID, label: "OCR", text: page.ocr_text, kept: false });
  }
  return readings;
}

/** The two readings to open with: the kept one, against the first other reader, or OCR. */
export function defaultPair(readings: Reading[]): [string, string] {
  const [first, second] = readings;
  return [first?.id ?? "", second?.id ?? first?.id ?? ""];
}

export interface DiffPart {
  text: string;
  /** Present in this reading and missing from the other. */
  changed: boolean;
}

export interface ReadingDiff {
  left: DiffPart[];
  right: DiffPart[];
  /** How many stretches of text one reading has and the other does not. */
  differences: number;
}

/** Word by word, what each of two readings has that the other lacks. */
export function diffReadings(left: string, right: string): ReadingDiff {
  const changes = diffWordsWithSpace(left, right);
  const leftParts: DiffPart[] = [];
  const rightParts: DiffPart[] = [];
  let differences = 0;
  for (const change of changes) {
    if (!change.added) leftParts.push({ text: change.value, changed: Boolean(change.removed) });
    if (!change.removed) rightParts.push({ text: change.value, changed: Boolean(change.added) });
    if (change.added || change.removed) differences += 1;
  }
  return { left: leftParts, right: rightParts, differences };
}
