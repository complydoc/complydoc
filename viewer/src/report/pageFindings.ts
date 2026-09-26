/** What was found on one page, ignored or not, as the document view lists it. */
import type { FindingRef } from "./route";
import type { DocumentEntry, Severity } from "./types";

export interface PageFinding {
  key: string;
  /** How a link names it; null for one the run's ignore file already set aside. */
  ref: FindingRef | null;
  fingerprint: string | undefined;
  label: string;
  /** The value as shown, or the start of the passage. */
  value: string;
  kind: "identifier" | "hidden";
  severity: Severity;
  /** Set aside by the ignore file the run read. */
  ignoredByRun: boolean;
}

/** Every finding on `page`, hidden passages first, then identifiers in reading order. */
export function pageFindings(document: DocumentEntry, page: number, unmasked: boolean): PageFinding[] {
  const shown = (masked: string, revealed?: string | null) => (unmasked ? (revealed ?? masked) : masked);
  const found: PageFinding[] = [];
  document.content_findings.forEach((finding, index) => {
    if (finding.page !== page) return;
    found.push({
      key: `hidden-${index}`,
      ref: { kind: "hidden", index },
      fingerprint: finding.fingerprint,
      label: "Hidden instruction",
      value: finding.excerpt,
      kind: "hidden",
      severity: finding.severity,
      ignoredByRun: false,
    });
  });
  document.sensitive.matches.forEach((match, index) => {
    if (match.page !== page) return;
    found.push({
      key: `identifier-${index}`,
      ref: { kind: "identifier", index },
      fingerprint: match.fingerprint,
      label: match.label,
      value: shown(match.masked, match.revealed),
      kind: "identifier",
      severity: match.severity,
      ignoredByRun: false,
    });
  });
  (document.ignored ?? []).forEach((ignored, index) => {
    const finding = ignored.identifier ?? ignored.content;
    if (!finding || finding.page !== page) return;
    found.push({
      key: `ignored-${index}`,
      ref: null,
      fingerprint: ignored.fingerprint,
      label: ignored.identifier?.label ?? "Hidden instruction",
      value: ignored.identifier
        ? shown(ignored.identifier.masked, ignored.identifier.revealed)
        : (ignored.content?.excerpt ?? ""),
      kind: ignored.identifier ? "identifier" : "hidden",
      severity: finding.severity,
      ignoredByRun: true,
    });
  });
  return found;
}
