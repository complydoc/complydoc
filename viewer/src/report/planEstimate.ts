/**
 * What one page, one document and a whole report cost and take under a loading plan: the
 * chosen reading's own tokens on the chosen model, and the reader's measured time.
 */
import { imagePrice, textPrice, type PricedModel } from "./pricing";
import { hasImage, keptName, ownText, type Plan } from "./plan";
import type { DocumentEntry, PageText, Report } from "./types";

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

/** A page nothing reads under the plan: nothing is sent, and no time is spent reading it. */
const UNREAD: PageEstimate = { usd: 0, seconds: 0, timed: "measured", read: false };

/** Which loader's reading of a page the plan uses, or null for a page with no text of its own. */
function loaderReading(report: Report, document: DocumentEntry, page: PageText, plan: Plan): string | null {
  if (!ownText(page)) return null;
  const kept = page.kept || keptName(report);
  const chosen = plan.loaders[document.format];
  if (chosen && chosen !== kept) {
    const text = page.readings[chosen];
    // A loader that returned nothing for the page leaves it unread; one that was not
    // asked about this page leaves it to the loader the run kept.
    if (text !== undefined) return text.trim() ? chosen : null;
  }
  return kept;
}

/** The OCR reading of a page, or null where OCR did not read it. */
function ocrReading(page: PageText): string | null {
  if (page.source === "ocr") return page.kept || "ocr";
  return page.tokens?.ocr ? "ocr" : null;
}

/** One page under a plan: what sending it costs, and how long reading it took. */
export function pageEstimate(report: Report, document: DocumentEntry, page: PageText, plan: Plan): PageEstimate {
  const loader = loaderReading(report, document, page, plan);
  const ocr = ocrReading(page);
  const text = (reader: string | null) => (reader ? asText(report, page, reader, plan.text) : UNREAD);
  const image = () => asImage(document, page, plan.vision);
  switch (plan.method) {
    case "loader":
      return text(loader);
    case "loader_ocr":
      return text(loader ?? ocr);
    case "ocr":
      // A file with no page picture, such as a spreadsheet, has nothing to recognise: its loader reads it.
      return text(ocr ?? loader);
    case "vision":
      return hasImage(document, page) ? image() : text(loader ?? ocr);
    case "router": {
      const route = document.routing?.pages.find((p) => p.number === page.number)?.route ?? "text";
      if (route === "vision" && hasImage(document, page)) return image();
      return text(route === "ocr" ? (ocr ?? loader) : (loader ?? ocr));
    }
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
