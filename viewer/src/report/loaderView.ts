/**
 * A loader comparison as the Loaders page shows it: one decision per file type that
 * more than one loader read, with the few figures that tell loaders apart and the
 * documents they read differently, which the document view diffs.
 */
import type { FormatComparison, LoaderComparison } from "./loaderTypes";
import type { Report } from "./types";

export interface LoaderFigures {
  name: string;
  /** Files it returned text for, and files it raised on. */
  read: number;
  failed: number;
  /** How alike its text is to the baseline's, 0 to 1; null for the baseline itself. */
  similarity: number | null;
  /** Identifiers another loader kept and this one lost, and how many of them are high. */
  missed: number;
  missedHigh: number;
  /** Expected facts it kept, of those in files it read; null where no fact was given. */
  facts: { kept: number; of: number } | null;
  seconds: number | null;
}

export interface Differing {
  /** Position of the document in the report, to open its diff. */
  index: number;
  path: string;
  /** The reader furthest from the baseline, and how alike it is. */
  reader: string;
  similarity: number;
}

export interface FactMiss {
  fact: string;
  missedBy: string[];
}

export interface TypeDecision {
  key: string;
  label: string;
  files: number;
  pick: string | null;
  /** Why there is no pick, in a sentence; empty where there is one. */
  why: string;
  loaders: LoaderFigures[];
  differing: Differing[];
  factsMissed: FactMiss[];
}

export interface LoaderView {
  /** Types more than one loader read, each to decide. */
  decided: TypeDecision[];
  /** Types one loader alone was meant for: no choice to make. */
  only: { label: string; loader: string }[];
  /** Types no loader was meant for. */
  unread: string[];
}

/** The verdict's first sentence, capitalised: the reason, without the evidence after it. */
function firstSentence(text: string): string {
  const sentence = (text.split(/(?<=\.)\s/)[0] ?? text).trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function formatOf(report: Report, path: string | undefined): string | null {
  return report.documents.find((d) => d.relative_path === path)?.format ?? null;
}

function differing(report: Report, format: string | null): Differing[] {
  const line = report.thresholds.similar_enough;
  return report.documents
    .map((document, index) => ({ document, index }))
    .filter(({ document }) => format === null || document.format === format)
    .flatMap(({ document, index }) => {
      const furthest = [...document.extractions.slice(1)].sort((a, b) => a.similarity - b.similarity)[0];
      return furthest && furthest.similarity < line
        ? [{ index, path: document.relative_path, reader: furthest.extractor, similarity: furthest.similarity }]
        : [];
    })
    .sort((a, b) => a.similarity - b.similarity);
}

function decision(report: Report, comparison: LoaderComparison, type: FormatComparison | null): TypeDecision {
  const format = type?.format ?? null;
  const inType = (path: string | undefined) => format === null || formatOf(report, path) === format;
  const differences = comparison.identifier_differences.filter((d) => inType(d.document));
  const facts = comparison.facts.filter(
    (check) => format === null || inType(Object.values(check.documents)[0] ?? undefined),
  );
  const names = type ? (type.ranked.length > 0 ? type.ranked : type.loaders.map((l) => l.name)) : comparison.ranked;

  const loaders = names.flatMap((name): LoaderFigures[] => {
    const overall = comparison.loaders.find((l) => l.name === name);
    const row = type?.loaders.find((l) => l.name === name);
    if (!overall && !row) return [];
    const failed = row ? Object.keys(row.failures).length : overall?.error ? 1 : 0;
    const checked = facts.filter((check) => name in check.found);
    return [
      {
        name,
        read: row?.documents ?? overall?.documents ?? 0,
        failed,
        similarity: name === comparison.baseline ? null : (row?.similarity ?? null),
        missed: differences.filter((d) => d.missed_by.includes(name)).length,
        missedHigh: differences.filter((d) => d.missed_by.includes(name) && d.severity === "high").length,
        facts:
          checked.length > 0
            ? { kept: checked.filter((check) => check.found[name] === "exact").length, of: checked.length }
            : null,
        seconds: row?.seconds ?? overall?.seconds ?? null,
      },
    ];
  });

  const pick = type ? type.recommended : comparison.recommended;
  return {
    key: format ?? "all",
    label: type?.label ?? "Every file",
    files: type?.documents ?? report.documents.length,
    pick,
    why: pick ? "" : firstSentence(type?.verdict ?? comparison.verdict),
    loaders,
    differing: differing(report, format),
    factsMissed: facts
      .map((check) => ({
        fact: check.fact,
        missedBy: Object.entries(check.found)
          .filter(([, found]) => found !== "exact")
          .map(([name]) => name),
      }))
      .filter((miss) => miss.missedBy.length > 0),
  };
}

export function loaderView(report: Report, comparison: LoaderComparison): LoaderView {
  const types = comparison.formats ?? [];
  // A comparison written before file types were told apart is one decision over every file.
  if (types.length === 0) return { decided: [decision(report, comparison, null)], only: [], unread: [] };
  return {
    decided: types.filter((type) => type.loaders.length > 1).map((type) => decision(report, comparison, type)),
    only: types
      .filter((type) => type.loaders.length === 1)
      .map((type) => ({ label: type.label, loader: type.loaders[0]?.name ?? "" })),
    unread: types.filter((type) => type.loaders.length === 0).map((type) => type.label),
  };
}
