/** Pages a judgement model said hold one of your concepts, across the report. */
import type { ConceptFinding, Report } from "./types";

export interface JudgedRow extends ConceptFinding {
  id: string;
  document: number;
  path: string;
}

/** Every page a model said holds a concept, most severe and surest first. */
export function judgedRows(report: Report): JudgedRow[] {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return report.documents
    .flatMap((document, index) =>
      (document.concept_findings ?? []).map((finding, position) => ({
        ...finding,
        id: `${index}-${position}`,
        document: index,
        path: document.relative_path,
      })),
    )
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.score - a.score || a.path.localeCompare(b.path));
}
