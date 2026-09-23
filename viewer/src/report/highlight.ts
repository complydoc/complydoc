/**
 * A finding shown where it sits: which page, what to mark in the text, and
 * which box to mark on the page picture.
 */
import type { DiffPart } from "./readings";
import type { FindingRef } from "./route";
import type { DocumentEntry, Evidence, Severity } from "./types";

export interface Highlight {
  kind: FindingRef["kind"];
  /** The page the finding is on, as printed. */
  page: number | null;
  /** What to mark in the text: the masked value, or the start of a hidden passage. */
  needle: string;
  /** The box to mark on the page picture, found by its value and label. */
  box: { value: string; label: string } | null;
  label: string;
  severity: Severity;
  evidence: Evidence | null;
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
      box: { value: match.masked, label: match.label },
      label: match.label,
      severity: match.severity,
      evidence: match.evidence,
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
  };
}

export interface Segment extends DiffPart {
  highlighted: boolean;
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Where a needle sits in a text, spacing aside, as [start, end) ranges. */
export function findAll(text: string, needle: string): [number, number][] {
  const words = needle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const pattern = new RegExp(words.map(escape).join("\\s+"), "g");
  return [...text.matchAll(pattern)].map((m) => [m.index, m.index + m[0].length]);
}

/** A reading's diff parts, cut again wherever the needle sits, so it can be marked across word boundaries. */
export function segments(parts: DiffPart[], needle: string | null): Segment[] {
  if (!needle) return parts.map((part) => ({ ...part, highlighted: false }));
  const ranges = findAll(parts.map((p) => p.text).join(""), needle);
  const out: Segment[] = [];
  let offset = 0;
  for (const part of parts) {
    const end = offset + part.text.length;
    const cuts = new Set([offset, end]);
    for (const [a, b] of ranges) {
      if (a > offset && a < end) cuts.add(a);
      if (b > offset && b < end) cuts.add(b);
    }
    const points = [...cuts].sort((x, y) => x - y);
    for (let i = 0; i < points.length - 1; i += 1) {
      const [from, to] = [points[i] as number, points[i + 1] as number];
      const highlighted = ranges.some(([a, b]) => from >= a && to <= b);
      out.push({ text: part.text.slice(from - offset, to - offset), changed: part.changed, highlighted });
    }
    offset = end;
  }
  return out;
}
