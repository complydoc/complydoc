/**
 * A loading plan: which reader takes each page, and which models the result is
 * sent to. Every page, document and folder is priced and timed under it.
 *
 * What a plan gets, costs and takes comes from what the run measured. Cost is
 * the reading's own tokens on the chosen model. Time is how long the reader took
 * on the machine that ran the audit: measured per page, or for a loader, its
 * total spread over its pages. A reader nothing timed has no time, not zero, and
 * the totals say how many pages that left out.
 */
import { imagePrice, textPrice, type PricedModel } from "./pricing";
import type { DocumentEntry, PageText, Report } from "./types";

/** How the pages are read. */
export type ReaderChoice = "kept" | "ocr" | "vision" | "routed" | `reader:${string}`;

export interface PlanOption {
  id: ReaderChoice;
  label: string;
  /** What choosing it means, in a line. */
  description: string;
}

export interface Plan {
  reader: ReaderChoice;
  text: PricedModel | null;
  vision: PricedModel | null;
}

/** The kept reading's reader, as the run named it. */
function keptName(report: Report): string {
  return report.run.extractor;
}

function hasScans(report: Report): boolean {
  return report.documents.some((d) => d.extracted_text.some((p) => p.source === "ocr"));
}

/** Every other reader the run compared, by the name its readings are kept under. */
function otherReaders(report: Report): string[] {
  const kept = keptName(report);
  const names = new Set<string>();
  for (const document of report.documents) {
    for (const page of document.extracted_text) {
      for (const name of Object.keys(page.readings)) {
        if (name !== kept && !name.startsWith("vision:") && page.source !== "ocr") names.add(name);
      }
    }
  }
  return [...names];
}

/** The ways this report's pages can be read, the one the run kept first. */
export function planOptions(report: Report): PlanOption[] {
  const kept = keptName(report);
  const options: PlanOption[] = [
    {
      id: "kept",
      label: hasScans(report) ? `${kept} + OCR on scans` : kept,
      description: "What the audit kept: the text layer, and OCR where a page had none.",
    },
    ...otherReaders(report).map((name) => ({
      id: `reader:${name}` as const,
      label: name,
      description: `Every page as ${name} read it.`,
    })),
  ];
  if (report.run.ocr_compare_used) {
    options.push({ id: "ocr", label: "OCR on every page", description: "Every page recognised from its picture." });
  }
  options.push({
    id: "vision",
    label: "Vision on every page",
    description: "Every page sent to the vision model as an image.",
  });
  if (report.documents.some((d) => d.routing?.pages.length)) {
    options.push({
      id: "routed",
      label: "Routed page by page",
      description: "Each page the cheapest way that reads it: text layer, OCR, or vision.",
    });
  }
  return options;
}

export interface PageEstimate {
  usd: number | null;
  seconds: number | null;
  /** How the time was got. `average` is a loader's total spread over its pages. */
  timed: "measured" | "average" | "none";
  /** Whether this plan reads anything off the page. */
  read: boolean;
}

/** A loader's seconds per page, from its total, for a report that compared loaders. */
function loaderAverage(report: Report, name: string): number | null {
  const loader = report.loader_comparison?.loaders.find((l) => l.name === name);
  if (!loader || loader.seconds === null || loader.pages === 0) return null;
  return loader.seconds / loader.pages;
}

function asText(report: Report, page: PageText, reader: string, model: PricedModel | null): PageEstimate {
  const measured = page.seconds?.[reader];
  const average = measured === undefined ? loaderAverage(report, reader) : null;
  const tokens = page.tokens?.[reader];
  return {
    usd: model ? (textPrice(page, reader, model)?.usd ?? null) : null,
    seconds: measured ?? average,
    timed: measured !== undefined ? "measured" : average !== null ? "average" : "none",
    read: tokens !== undefined && Object.values(tokens).some((n) => n > 0),
  };
}

function asImage(document: DocumentEntry, page: PageText, model: PricedModel | null): PageEstimate {
  const label = document.verification?.model;
  const seconds = label ? page.seconds?.[label] : undefined;
  return {
    usd: model ? (imagePrice(page, model)?.usd ?? null) : null,
    // Only a real call is timed: a vision model's speed is not something to guess.
    seconds: seconds ?? null,
    timed: seconds !== undefined ? "measured" : "none",
    read: Boolean(page.image_tokens && Object.keys(page.image_tokens).length > 0),
  };
}

/** One page under a plan: what sending it costs, and how long reading it took. */
export function pageEstimate(report: Report, document: DocumentEntry, page: PageText, plan: Plan): PageEstimate {
  const kept = page.kept || keptName(report);
  switch (plan.reader) {
    case "kept":
      return asText(report, page, kept, plan.text);
    case "ocr":
      return asText(report, page, page.source === "ocr" ? kept : "ocr", plan.text);
    case "vision":
      return asImage(document, page, plan.vision);
    case "routed": {
      const route = document.routing?.pages.find((p) => p.number === page.number)?.route ?? "text";
      if (route === "vision") return asImage(document, page, plan.vision);
      return asText(report, page, kept, plan.text);
    }
    default:
      return asText(report, page, plan.reader.slice("reader:".length), plan.text);
  }
}

export interface Totals {
  documents: number;
  pages: number;
  /** Pages the plan reads something off. */
  pagesRead: number;
  usd: number | null;
  /** Pages with no price on the chosen model. */
  unpriced: number;
  seconds: number | null;
  /** Pages nothing timed, left out of `seconds`. */
  untimed: number;
  /** Whether any of the time is a loader's average rather than per page. */
  averaged: boolean;
}

export const EMPTY: Totals = {
  documents: 0,
  pages: 0,
  pagesRead: 0,
  usd: null,
  unpriced: 0,
  seconds: null,
  untimed: 0,
  averaged: false,
};

function add(a: number | null, b: number | null): number | null {
  return a === null ? b : b === null ? a : a + b;
}

export function combine(a: Totals, b: Totals): Totals {
  return {
    documents: a.documents + b.documents,
    pages: a.pages + b.pages,
    pagesRead: a.pagesRead + b.pagesRead,
    usd: add(a.usd, b.usd),
    unpriced: a.unpriced + b.unpriced,
    seconds: add(a.seconds, b.seconds),
    untimed: a.untimed + b.untimed,
    averaged: a.averaged || b.averaged,
  };
}

/** A whole document under a plan. */
export function documentTotals(report: Report, document: DocumentEntry, plan: Plan): Totals {
  let totals: Totals = { ...EMPTY, documents: 1 };
  for (const page of document.extracted_text) {
    const estimate = pageEstimate(report, document, page, plan);
    totals = combine(totals, {
      ...EMPTY,
      pages: 1,
      pagesRead: estimate.read ? 1 : 0,
      usd: estimate.usd,
      unpriced: estimate.usd === null ? 1 : 0,
      seconds: estimate.seconds,
      untimed: estimate.seconds === null ? 1 : 0,
      averaged: estimate.timed === "average",
    });
  }
  return totals;
}

/** The whole report under a plan. */
export function reportTotals(report: Report, plan: Plan): Totals {
  return report.documents.reduce((sum, document) => combine(sum, documentTotals(report, document, plan)), EMPTY);
}
