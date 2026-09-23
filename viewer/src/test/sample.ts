import raw from "@/fixtures/report.json?raw";
import { parseReport } from "@/report/parse";
import type { LoaderComparison, Report } from "@/report/types";

/**
 * The report complydoc wrote comparing pypdf and pdfplumber over its sample
 * folder, with one expected fact. A fresh copy each call, so a test can change it.
 */
export function sampleReport(): Report {
  return parseReport(raw);
}

export const sampleText = raw;

/** The sample report with its loader comparison, which it always has. */
export function sampleWithComparison(): Report & { loader_comparison: LoaderComparison } {
  const report = sampleReport();
  if (!report.loader_comparison) throw new Error("the sample report has no loader comparison");
  return { ...report, loader_comparison: report.loader_comparison };
}
