/** The parts of a report about your setup: the findings ignored, and your own concepts. */
import type { ContentFinding, SensitiveMatch, Severity } from "./types";

/** One entry of an ignore file: a finding set aside, and why. */
export interface IgnoreRule {
  finding: string;
  reason: string;
  by?: string | null;
  until?: string | null;
  paths?: string[];
  what?: string | null;
  added?: string | null;
  /** On the run: findings it set aside. */
  matched?: number;
  /** On the run: past its end date, so it set nothing aside. */
  expired?: boolean;
}

export interface IgnoreSummary {
  file: string;
  rules: IgnoreRule[];
}

/** A finding an ignore file set aside: out of every count, kept with its reason. */
export interface IgnoredFinding {
  fingerprint: string;
  kind: "identifier" | "content";
  reason: string;
  by: string | null;
  until: string | null;
  identifier: SensitiveMatch | null;
  content: ContentFinding | null;
}

/** One of your own things to look for, described in words. */
export interface Concept {
  id: string;
  label: string;
  description: string;
  /** A regular expression that finds it on every run, matched ignoring case. */
  pattern?: string | null;
  severity: Severity;
  /** Also asked of a judgement model, page by page, on runs with --judge-concepts. */
  judge?: boolean;
}

/** A concept as a run reported it: how often its pattern matched, and on how many pages a model found it. */
export interface ConceptRule extends Concept {
  found: number;
  judged?: number;
}

export interface ConceptSummary {
  file: string;
  concepts: ConceptRule[];
  /** The judgement model concepts were put to, or null when the run asked none. */
  judge?: string | null;
  unjudged?: number;
}

/** A page a judgement model said holds one of your concepts. The model says whether, not where. */
export interface ConceptFinding {
  page: number;
  concept: string;
  label: string;
  severity: Severity;
  score: number;
}
