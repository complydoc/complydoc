import type { Report } from "./types";

export interface NotLookedFor {
  category: string;
  label: string;
  reason: string;
  documents: number;
}

/**
 * Identifier categories nothing was looked for in some document, most documents first.
 * A category that was never scanned counts no findings, which reads the same as a clean
 * one unless it is said.
 */
export function notLookedFor(report: Report): NotLookedFor[] {
  const found = new Map<string, NotLookedFor>();
  for (const document of report.documents) {
    for (const unscanned of document.sensitive.unscanned_categories ?? []) {
      const entry = found.get(unscanned.category) ?? { ...unscanned, documents: 0 };
      entry.documents += 1;
      found.set(unscanned.category, entry);
    }
  }
  // A category switched off in the categories file was not looked for in any document.
  for (const change of report.categories?.changes ?? []) {
    if (change.enabled || !change.shipped_enabled) continue;
    found.set(change.category, {
      category: change.category,
      label: change.label,
      reason: "it was switched off in the categories file, so nothing of it is reported. Its values are still masked.",
      documents: report.documents.length,
    });
  }
  return [...found.values()].sort((a, b) => b.documents - a.documents || a.label.localeCompare(b.label));
}
