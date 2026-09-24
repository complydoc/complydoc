import auditRaw from "@/fixtures/audit.json?raw";
import loadersRaw from "@/fixtures/loaders.json?raw";
import { parseReport } from "@/report/parse";
import type { LoaderComparison, Report } from "@/report/types";

/**
 * The report complydoc wrote comparing pypdf and pdfplumber over its sample
 * folder, with one expected fact. A fresh copy each call, so a test can change it.
 */
export function sampleReport(): Report {
  return parseReport(loadersRaw);
}

export const sampleText = loadersRaw;

/** The sample report with its loader comparison, which it always has. */
export function sampleWithComparison(): Report & { loader_comparison: LoaderComparison } {
  const report = sampleReport();
  if (!report.loader_comparison) throw new Error("the sample report has no loader comparison");
  return { ...report, loader_comparison: report.loader_comparison };
}

/**
 * A full audit of the same folder: pdfplumber kept, pypdf compared, every page
 * OCR'd and pictured.
 */
export function sampleAudit(): Report {
  return parseReport(auditRaw);
}

/** A value a test knows is there, or a failure that says which one was not. */
export function required<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} in the sample`);
  return value;
}

/**
 * The full audit as `--verify` would leave it: the first document's first page
 * read again by a vision model that found a line the kept reading lacks, at a
 * price from the provider's token counts.
 */
export function sampleVerified(): Report {
  const report = sampleAudit();
  const document = required(report.documents[0], "a document");
  const page = required(document.extracted_text[0], "a page");
  const cost = { usd: 0.0175, basis: "actual" as const, model: "claude-opus-5", input_tokens: 1500, output_tokens: 400 };
  page.readings = { ...page.readings, "vision:claude-opus-5": `${page.text}\nA line only the picture had.` };
  page.costs = { [report.run.extractor]: { usd: 0, basis: "local", model: null, input_tokens: null, output_tokens: null } };
  page.costs["vision:claude-opus-5"] = cost;
  page.kept = report.run.extractor;
  document.verification = {
    model: "vision:claude-opus-5",
    scope: "all",
    pages_total: document.page_count,
    pages: [
      {
        number: page.number,
        status: "disagrees",
        why: "every page is checked",
        similarity: 0.91,
        coverage: 0.84,
        missing: "A line only the picture had",
        cost,
        error: null,
      },
    ],
    unreadable_pages: [],
    sent_to: ["api.example.com"],
  };
  report.run = { ...report.run, schema_version: 16, verify_model: "vision:claude-opus-5", verify_scope: "all" };
  report.verification = {
    model: "vision:claude-opus-5",
    scope: "all",
    min_coverage: 0.9,
    documents: 1,
    pages_total: document.page_count,
    pages_checked: 1,
    pages_agree: 0,
    pages_disagree: 1,
    pages_filled: 0,
    pages_failed: 0,
    pages_unreadable: 0,
    usd: 0.0175,
    usd_basis: "actual",
    headline: `1 of ${document.page_count} pages checked against an independent vision read: 1 disagrees`,
  };
  return report;
}
