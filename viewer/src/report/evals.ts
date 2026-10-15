import type { EvalCheck, EvalSummary } from "./types";

/** How a reader did on one expected fact. */
export type Outcome = "kept" | "near" | "lost";

/** What the folder's evals file holds, as `complydoc ui` lists it. */
export interface ExpectedFact {
  text: string;
  document?: string | null;
}

export function outcome(check: EvalCheck, reader: string): Outcome {
  const found = check.found[reader];
  if (found === "exact") return "kept";
  return found ? "near" : "lost";
}

export interface Score {
  reader: string;
  kept: number;
  near: number;
  lost: number;
  total: number;
}

/** Each reader's count of facts kept, best first; a near miss is not a fact kept. */
export function scoreboard(evals: EvalSummary): Score[] {
  return evals.readers
    .map((reader) => {
      const outcomes = evals.checks.map((check) => outcome(check, reader));
      return {
        reader,
        kept: outcomes.filter((o) => o === "kept").length,
        near: outcomes.filter((o) => o === "near").length,
        lost: outcomes.filter((o) => o === "lost").length,
        total: outcomes.length,
      };
    })
    .sort((a, b) => b.kept - a.kept || b.near - a.near || a.reader.localeCompare(b.reader));
}

const key = (text: string, document?: string | null) => `${text.toLowerCase()}\u0000${document ?? ""}`;

/** The run's check of a fact in the file, or undefined when it was added since the run. */
export function checkFor(evals: EvalSummary | null | undefined, fact: ExpectedFact): EvalCheck | undefined {
  return evals?.checks.find((check) => key(check.fact, check.document) === key(fact.text, fact.document));
}

/** The facts to show: the file's when it can be read, else the ones the run checked. */
export function factsToShow(listed: ExpectedFact[] | null, evals: EvalSummary | null | undefined): ExpectedFact[] {
  if (listed) return listed;
  return (evals?.checks ?? []).map((check) => ({ text: check.fact, document: check.document ?? null }));
}
