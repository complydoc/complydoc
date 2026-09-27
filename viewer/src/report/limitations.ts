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
  return [...found.values()].sort((a, b) => b.documents - a.documents || a.label.localeCompare(b.label));
}
