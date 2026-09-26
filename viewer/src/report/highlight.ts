/**
 * A finding shown where it sits: which page, what to mark in the text, and
 * which box to mark on the page picture.
 */
import type { BoxRef } from "./picture";
import type { FindingRef } from "./route";
import type { DocumentEntry, Evidence, SensitiveMatch, Severity } from "./types";

export interface Highlight {
  kind: FindingRef["kind"];
  /** The page the finding is on, as printed. */
  page: number | null;
  /** What to mark in the text: the masked value, or the start of a hidden passage. */
  needle: string;
  /** The box to mark on the page picture, found by its value and label. */
  box: BoxRef | null;
  label: string;
  severity: Severity;
  evidence: Evidence | null;
  /** The identifier itself, for how it was validated. */
  match: SensitiveMatch | null;
}

/** Long enough to be found only where it is; short enough to survive a line break the reader added. */
const PASSAGE_START = 48;

export function findingHighlight(document: DocumentEntry, ref: FindingRef): Highlight | null {
  if (ref.kind === "identifier") {
    const match = document.sensitive.matches[ref.index];
    if (!match) return null;
    return {
      kind: "identifier",
      page: match.page,
      needle: match.masked,
      box: { value: match.masked, label: match.label, revealed: match.revealed ?? null },
      label: match.label,
      severity: match.severity,
      evidence: match.evidence,
      match,
    };
  }
  const finding = document.content_findings[ref.index];
  if (!finding) return null;
  return {
    kind: "hidden",
    page: finding.page,
    needle: finding.excerpt.slice(0, PASSAGE_START),
    box: null,
    label: "Hidden instruction",
    severity: finding.severity,
    evidence: null,
    match: null,
  };
}
