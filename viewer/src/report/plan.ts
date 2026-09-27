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
export type Method = "loader" | "loader_ocr" | "ocr" | "vision" | "router";

export interface PlanOption {
  id: Method;
  label: string;
  /** What choosing it means, in a line. */
  description: string;
  /** The way complydoc would read these documents. */
  recommended?: boolean;
}

export interface Plan {
  method: Method;
  /**
   * The loader chosen for each file type the run read more than one way, by
   * format: `{ pdf: "pypdf" }`. A type not named here is read by the loader the
   * run kept for it, and every type but a PDF has only its own.
   */
  loaders: Record<string, string>;
  text: PricedModel | null;
  vision: PricedModel | null;
}

/** A file type the run read with more than one loader, and those loaders, the kept one first. */
export interface LoaderChoice {
  format: string;
  label: string;
  readers: string[];
}

const FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  pptx: "PowerPoint",
  html: "HTML",
  markdown: "Markdown",
  text: "Text",
  email: "Email",
  image: "Images",
  other: "Other files",
};

function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format;
}

/** The kept reading's reader, as the run named it. */
function keptName(report: Report): string {
  return report.run.extractor;
}

/** A page read from its own text: a text layer, a document's own text, or a loader's. */
function ownText(page: PageText): boolean {
  return page.source === "native" || page.source === "loader";
}

function hasScans(report: Report): boolean {
  return report.documents.some((d) => d.extracted_text.some((p) => !ownText(p)));
}

/** Each file type's loaders, the kept one first, from the pages each read. */
export function readersByFormat(report: Report): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const document of report.documents) {
    const readers = found.get(document.format) ?? [];
    for (const page of document.extracted_text) {
      if (!ownText(page)) continue;
      for (const name of [page.kept || keptName(report), ...Object.keys(page.readings)]) {
        if (name && !name.startsWith("vision:") && !readers.includes(name)) readers.push(name);
      }
    }
    found.set(document.format, readers);
  }
  return found;
}

/** The file types a loader can be chosen for: those the run read more than one way. */
export function loaderChoices(report: Report): LoaderChoice[] {
  return [...readersByFormat(report)]
    .filter(([, readers]) => readers.length > 1)
    .map(([format, readers]) => ({ format, label: formatLabel(format), readers }));
}

/** Each type's loader in words: "pdfplumber for PDF, python-docx for Word". */
function loaderSummary(report: Report, loaders: Record<string, string>): string {
  return [...readersByFormat(report)]
    .filter(([, readers]) => readers.length > 0)
    .map(([format, readers]) => `${loaders[format] ?? readers[0]} for ${formatLabel(format)}`)
    .join(", ");
}

/** The ways this report's pages can be read, with the loaders chosen in `loaders`. */
export function planOptions(report: Report, loaders: Record<string, string> = {}): PlanOption[] {
  const which = loaderSummary(report, loaders);
  const scans = hasScans(report);
  const options: PlanOption[] = [
    {
      id: "loader",
      label: "Loader",
      description: `Each file's own text, as its loader reads it${which ? `: ${which}` : ""}.${
        scans ? " Scanned pages stay unread." : ""
      }`,
    },
  ];
  if (scans) {
    options.push({
      id: "loader_ocr",
      label: "Loader + OCR on scans",
      description: "Each file's own text, and OCR where a page has none, as the audit read them.",
    });
  }
  if (report.run.ocr_compare_used) {
    options.push({
      id: "ocr",
      label: "OCR on every page",
      description: "Every page recognised from its picture. A file with no page picture, such as a spreadsheet, is read by its loader.",
    });
  }
  // Only where some page can be shown to a vision model: otherwise every page would fall back
  // to its loader, and the option would price the loader under another name.
  if (report.documents.some((d) => d.extracted_text.some((page) => hasImage(d, page)))) {
    options.push({
      id: "vision",
      label: "Vision on every page",
      description:
        "Every page sent to the vision model as an image. A file with no page picture is read by its loader.",
    });
  }
  if (report.documents.some((d) => d.routing?.pages.length)) {
    options.push({
      id: "router",
      label: "complydoc router",
      description: "Each page read the cheapest way that reads it well: its loader, OCR, or a vision model.",
      recommended: true,
    });
  }
  return options;
}

/** The way to read a report when nothing was chosen: the router where the run routed pages. */
export function defaultMethod(options: PlanOption[]): Method {
  return (options.find((o) => o.recommended) ?? options.find((o) => o.id === "loader_ocr") ?? options[0])?.id ?? "loader";
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

/** The file types complydoc can draw as page pictures; other files carry a picture's size only as an estimate. */
const DRAWN = new Set(["pdf", "image"]);

/** Whether a vision model can be shown this page. */
function hasImage(document: DocumentEntry, page: PageText): boolean {
  return DRAWN.has(document.format) && Boolean(page.image_tokens && Object.keys(page.image_tokens).length > 0);
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
