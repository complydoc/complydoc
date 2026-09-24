/**
 * The readings of one page, and how two of them differ.
 *
 * A page can be read several ways: the text layer by the extractor the run
 * kept, by other extractors or loaders it compared, and by OCR. Setting two
 * side by side, with what one has and the other lacks marked, is how a person
 * sees what a reader did to a page.
 */
import { diffWordsWithSpace } from "diff";
import { formatPageUsd } from "./format";
import type { PageText, ReadingCost } from "./types";

export interface Reading {
  /** Stable id for a picker: the reader's name, or "ocr". */
  id: string;
  label: string;
  text: string;
  /** The reading the report's findings were built from. */
  kept: boolean;
  /** What making this reading cost; absent in a report from before costs were kept. */
  cost?: ReadingCost;
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
  const costs = page.costs ?? {};
  // A page only a vision model could read kept that model's reading.
  const keptId = page.source === "vision" && page.kept ? page.kept : kept;
  const withCost = (reading: Reading, key: string): Reading => {
    const cost = costs[key];
    return cost ? { ...reading, cost } : reading;
  };
  const readings: Reading[] = [
    withCost({ id: keptId, label: scanned ? "OCR" : keptId, text: page.text, kept: true }, page.kept || keptId),
  ];
  for (const [name, text] of Object.entries(page.readings)) {
    if (name === keptId || (scanned && text === page.text)) continue;
    readings.push(withCost({ id: name, label: name, text, kept: false }, name));
  }
  if (page.ocr_text.trim() && !scanned) {
    readings.push(withCost({ id: OCR_ID, label: "OCR", text: page.ocr_text, kept: false }, OCR_ID));
  }
  return readings;
}

/** Whether a reader of this page was a vision model. */
export function isVision(reading: Reading): boolean {
  return reading.id.startsWith("vision:");
}

/**
 * A reading's cost as a person reads it. A local reader is "free", not $0.00:
 * the two look alike in a list of prices, and only one is true of a reader
 * that ran on the machine with no bill at all.
 */
export function costLabel(cost: ReadingCost | undefined | null): string | null {
  if (!cost) return null;
  if (cost.basis === "local") return "free · local";
  if (cost.usd === null) return "no price";
  const figure = formatPageUsd(cost.usd);
  return cost.basis === "actual" ? figure : `~${figure}`;
}

/** What kind of figure a cost is, for a tooltip or a caption. */
export function costBasis(cost: ReadingCost): string {
  switch (cost.basis) {
    case "local":
      return "ran on the auditing machine, so there is no bill to show";
    case "actual":
      return "priced from the provider's own token counts";
    case "estimated":
      return `estimated from the page's size${cost.model ? ` for ${cost.model}` : ""}`;
    default:
      return "no price is known for this reader";
  }
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
