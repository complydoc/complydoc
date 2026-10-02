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
import type { PricedModel } from "./pricing";
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
export function keptName(report: Report): string {
  return report.run.extractor;
}

/** A page read from its own text: a text layer, a document's own text, or a loader's. */
export function ownText(page: PageText): boolean {
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
      description:
        "Every page recognised from its picture. A file with no page picture, such as a spreadsheet, is read by its loader.",
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
  return (
    (options.find((o) => o.recommended) ?? options.find((o) => o.id === "loader_ocr") ?? options[0])?.id ?? "loader"
  );
}

/** The file types complydoc can draw as page pictures; other files carry a picture's size only as an estimate. */
const DRAWN = new Set(["pdf", "image"]);

/** Whether a vision model can be shown this page. */
export function hasImage(document: DocumentEntry, page: PageText): boolean {
  return DRAWN.has(document.format) && Boolean(page.image_tokens && Object.keys(page.image_tokens).length > 0);
}
