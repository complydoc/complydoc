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
