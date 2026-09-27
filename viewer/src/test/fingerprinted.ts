import type { Report } from "@/report/types";

/** A report as schema 17 writes it: every finding with a fingerprint, as an ignore names it. */
export function fingerprinted(report: Report): Report {
  return {
    ...report,
    documents: report.documents.map((document, d) => ({
      ...document,
      sensitive: {
        ...document.sensitive,
        matches: document.sensitive.matches.map((match, m) => ({
          ...match,
          fingerprint: `id-${String(d).padStart(4, "0")}${String(m).padStart(12, "0")}`,
        })),
      },
    })),
  };
}
