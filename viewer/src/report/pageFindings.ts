import { contentLabel } from "./security";
/** What was found in a document, ignored or not, as the document view marks it in the text. */
import type { FindingRef } from "./route";
import type { DocumentEntry, Evidence, SensitiveMatch, Severity } from "./types";

export interface PageFinding {
  /** Unique in the document: `identifier-3`, `hidden-0`, or `ignored-2` for one the run set aside. */
  key: string;
  /** How a link names it; null for one the run's ignore file already set aside. */
  ref: FindingRef | null;
  fingerprint: string | undefined;
  label: string;
  /** The value as shown, or the passage. */
  value: string;
  /** What to look for in the text: the value, or the start of the passage. */
  needle: string;
  kind: "identifier" | "hidden";
  severity: Severity;
  evidence: Evidence | null;
  /** The identifier itself, for how it was validated. */
  match: SensitiveMatch | null;
  page: number | null;
  /** Set aside by the ignore file the run read. */
  ignoredByRun: boolean;
  /** Times the same value was found in the document. */
  count: number;
}

/** Long enough to be found only where it is; short enough to stay within one sentence. */
const PASSAGE_START = 40;

const start = (excerpt: string) => excerpt.replace(/…$/, "").slice(0, PASSAGE_START);

/**
 * Everything found in the document, in page order. A value found several times
 * is one finding: it reads the same wherever it sits, so it is marked, and
 * ignored, as one.
 */
export function documentFindings(document: DocumentEntry, unmasked: boolean): PageFinding[] {
  const shown = (masked: string, revealed?: string | null) => (unmasked ? (revealed ?? masked) : masked);
  const found: PageFinding[] = [];
  const seen = new Map<string, PageFinding>();
  const add = (finding: Omit<PageFinding, "count">) => {
    const same = `${finding.fingerprint ?? ""}\u0000${finding.label}\u0000${finding.value}`;
    const earlier = seen.get(same);
    if (earlier) {
      earlier.count += 1;
      return;
    }
    const entry = { ...finding, count: 1 };
    seen.set(same, entry);
    found.push(entry);
  };
  document.content_findings.forEach((finding, index) =>
    add({
      key: `hidden-${index}`,
      ref: { kind: "hidden", index },
      fingerprint: finding.fingerprint,
      label: contentLabel(finding),
      value: finding.excerpt,
      needle: start(finding.excerpt),
      kind: "hidden",
      severity: finding.severity,
      evidence: null,
      match: null,
      page: finding.page,
      ignoredByRun: false,
    }),
  );
  document.sensitive.matches.forEach((match, index) => {
    const value = shown(match.masked, match.revealed);
    add({
      key: `identifier-${index}`,
      ref: { kind: "identifier", index },
      fingerprint: match.fingerprint,
      label: match.label,
      value,
      needle: value,
      kind: "identifier",
      severity: match.severity,
      evidence: match.evidence,
      match,
      page: match.page,
      ignoredByRun: false,
    });
  });
  (document.ignored ?? []).forEach((ignored, index) => {
    const finding = ignored.identifier ?? ignored.content;
    if (!finding) return;
    const value = ignored.identifier
      ? shown(ignored.identifier.masked, ignored.identifier.revealed)
      : (ignored.content?.excerpt ?? "");
    add({
      key: `ignored-${index}`,
      ref: null,
      fingerprint: ignored.fingerprint,
      label: ignored.identifier?.label ?? "Hidden text",
      value,
      needle: ignored.identifier ? value : start(value),
      kind: ignored.identifier ? "identifier" : "hidden",
      severity: finding.severity,
      evidence: ignored.identifier?.evidence ?? null,
      match: ignored.identifier,
      page: finding.page,
      ignoredByRun: true,
    });
  });
  return found.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
}

/** The finding a link named, among the document's findings: itself, or the one its value was folded into. */
export function findingFor(findings: PageFinding[], document: DocumentEntry, ref: FindingRef): PageFinding | undefined {
  const key = `${ref.kind}-${ref.index}`;
  const direct = findings.find((f) => f.key === key);
  if (direct) return direct;
  const match = ref.kind === "identifier" ? document.sensitive.matches[ref.index] : undefined;
  return match ? findings.find((f) => f.match?.masked === match.masked && f.label === match.label) : undefined;
}

/**
 * A finding in words for the ignore file, which never holds a value: the
 * identifier's masked form whatever the screen shows, and a passage by its
 * page, since a revealing run keeps values in a passage's excerpt.
 */
export function ignoreDescription(finding: PageFinding): string {
  if (finding.match) return `${finding.label} ${finding.match.masked}`;
  return finding.page !== null ? `${finding.label} on page ${finding.page}` : finding.label;
}

export interface FindingContext {
  before: string;
  hit: string;
  after: string;
}

/** Characters shown either side of a finding in its context line. */
const AROUND = 70;

/**
 * The text around a finding on its page: what comes before and after it, cut at a line
 * break or `AROUND` characters, whichever is nearer. Spacing in the value is not required
 * to match, as a masked value's spacing need not be the page's. Null where it is not found.
 */
export function findingContext(pageText: string, needle: string): FindingContext | null {
  const words = needle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
  const match = pattern.exec(pageText);
  if (!match) return null;
  const start = match.index;
  const end = start + match[0].length;
  const lineStart = pageText.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = pageText.indexOf("\n", end);
  const from = Math.max(lineStart, start - AROUND);
  const to = Math.min(lineEnd === -1 ? pageText.length : lineEnd, end + AROUND);
  return {
    before: (from > lineStart ? "…" : "") + pageText.slice(from, start),
    hit: match[0],
    after: pageText.slice(end, to) + (to < (lineEnd === -1 ? pageText.length : lineEnd) ? "…" : ""),
  };
}
