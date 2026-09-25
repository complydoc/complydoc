/** What the documents carry that should not leave, arranged for the Security page. */
import { EVIDENCE, SEVERITIES } from "./select";
import type { Evidence, Report, SensitiveMatch, Severity } from "./types";

export interface FindingRow {
  id: string;
  /** Position among the document's identifiers, which is how a link names it. */
  match: number;
  /** Position in the report's document list, which is how a document is opened. */
  document: number;
  path: string;
  page: number | null;
  label: string;
  masked: string;
  severity: Severity;
  evidence: Evidence;
  /** The identifier as the report has it, for how it was validated. */
  source: SensitiveMatch;
}

/** Every identifier found, most severe and best evidenced first. */
export function findingRows(report: Report): FindingRow[] {
  const rank = (severity: Severity) => SEVERITIES.indexOf(severity);
  const strength = (evidence: Evidence) => EVIDENCE.findIndex((e) => e.key === evidence);
  return report.documents
    .flatMap((document, index) =>
      document.sensitive.matches.map((match, position) => ({
        id: `${index}-${position}`,
        match: position,
        document: index,
        path: document.relative_path,
        page: match.page,
        label: match.label,
        masked: match.masked,
        severity: match.severity,
        evidence: match.evidence,
        source: match,
      })),
    )
    .sort(
      (a, b) =>
        rank(a.severity) - rank(b.severity) ||
        strength(a.evidence) - strength(b.evidence) ||
        a.path.localeCompare(b.path),
    );
}

export type SeverityCounts = Record<Severity, number>;

/** For each document carrying something, how many findings at each severity; most first. */
export function severityByDocument(report: Report): ({ path: string } & SeverityCounts)[] {
  return report.documents
    .map((document) => {
      const counts: SeverityCounts = { high: 0, medium: 0, low: 0 };
      for (const match of document.sensitive.matches) counts[match.severity] += 1;
      return { path: document.relative_path, ...counts };
    })
    .filter((row) => row.high + row.medium + row.low > 0)
    .sort((a, b) => b.high + b.medium + b.low - (a.high + a.medium + a.low));
}

export interface HiddenInstruction {
  id: string;
  /** Position among the document's hidden instructions. */
  finding: number;
  document: number;
  path: string;
  page: number | null;
  excerpt: string;
  severity: Severity;
  reasons: string[];
  hiddenBy: string[];
  fingerprint?: string | undefined;
}

/** Passages written for a model and hidden from a person, where they are and why each was flagged. */
export function hiddenInstructions(report: Report): HiddenInstruction[] {
  return report.documents.flatMap((document, index) =>
    document.content_findings.map((finding, position) => ({
      id: `${index}-${position}`,
      finding: position,
      document: index,
      path: document.relative_path,
      page: finding.page,
      excerpt: finding.excerpt,
      severity: finding.severity,
      reasons: finding.instruction_reasons,
      hiddenBy: finding.hidden_reasons,
      fingerprint: finding.fingerprint,
    })),
  );
}

/** How many findings rest on each kind of evidence, strongest first. */
export function evidenceCounts(report: Report): { label: string; count: number }[] {
  const matches = report.documents.flatMap((document) => document.sensitive.matches);
  return EVIDENCE.map(({ key, label }) => ({ label, count: matches.filter((m) => m.evidence === key).length })).filter(
    (row) => row.count > 0,
  );
}

export interface IgnoredRow {
  id: string;
  document: number;
  path: string;
  page: number | null;
  fingerprint: string;
  /** The finding in words: the identifier and its masked value, or the passage. */
  what: string;
  reason: string;
  by: string | null;
  until: string | null;
}

/** Every finding an ignore file set aside on this run, in document order. */
export function ignoredRows(report: Report): IgnoredRow[] {
  return report.documents.flatMap((document, index) =>
    (document.ignored ?? []).map((ignored, position) => {
      const finding = ignored.identifier ?? ignored.content;
      return {
        id: `${index}-${position}`,
        document: index,
        path: document.relative_path,
        page: finding?.page ?? null,
        fingerprint: ignored.fingerprint,
        what: ignored.identifier
          ? `${ignored.identifier.label} ${ignored.identifier.masked}`
          : `“${ignored.content?.excerpt ?? ""}”`,
        reason: ignored.reason,
        by: ignored.by,
        until: ignored.until,
      };
    }),
  );
}
