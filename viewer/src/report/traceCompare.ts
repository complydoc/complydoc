/**
 * Two runs of one pipeline side by side, the way an experiment's runs are compared: the
 * same steps lined up, what their settings were in each, and what each made. Both ran on
 * the same documents, so a difference is the pipeline's, not the folder's.
 */
import type { Trace } from "./traceTypes";
import { identifiersSent, stepsOf, type Step } from "./traceView";

export interface StepPair {
  /** The step in each run; null where one run had no such step. */
  a: Step | null;
  b: Step | null;
  /** Settings whose value differed, with each run's. */
  changed: { name: string; a: unknown; b: unknown }[];
}

const same = (a: Step, b: Step) => a.kind === b.kind && a.component === b.component;

/**
 * The steps of both runs lined up: those the two share matched in order, and a step one run
 * has and the other lacks, such as a masking step added, against a gap.
 */
export function pairSteps(first: Trace, second: Trace): StepPair[] {
  const a = stepsOf(first);
  const b = stepsOf(second);
  // The longest run of steps both share, in order, found as for a diff.
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) {
      const row = table[i] as number[];
      row[j] = same(a[i] as Step, b[j] as Step)
        ? ((table[i + 1] as number[])[j + 1] ?? 0) + 1
        : Math.max((table[i + 1] as number[])[j] ?? 0, row[j + 1] ?? 0);
    }
  const pairs: StepPair[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const x = a[i];
    const y = b[j];
    if (x && y && same(x, y)) {
      pairs.push({ a: x, b: y, changed: changes(x, y) });
      i++;
      j++;
    } else if (x && (!y || ((table[i + 1] as number[])[j] ?? 0) >= ((table[i] as number[])[j + 1] ?? 0))) {
      pairs.push({ a: x, b: null, changed: [] });
      i++;
    } else if (y) {
      pairs.push({ a: null, b: y, changed: [] });
      j++;
    }
  }
  return pairs;
}

function changes(a: Step, b: Step): StepPair["changed"] {
  const names = [...new Set([...Object.keys(a.parameters), ...Object.keys(b.parameters)])].sort();
  return names
    .filter((name) => JSON.stringify(a.parameters[name] ?? null) !== JSON.stringify(b.parameters[name] ?? null))
    .map((name) => ({ name, a: a.parameters[name], b: b.parameters[name] }));
}

export interface RunFigures {
  seconds: number;
  /** What the last step was given: chunks to embed, say. */
  passedOn: number | null;
  tokens: number | null;
  usd: number | null;
  identifiersSent: number | null;
}

export function runFigures(trace: Trace): RunFigures {
  const steps = stepsOf(trace);
  const last = steps[steps.length - 1];
  const priced = trace.stages.filter((s) => typeof s.usd === "number");
  return {
    seconds: trace.seconds,
    passedOn: last ? (last.kind === "embed" ? last.documentsIn : last.documentsOut) : null,
    tokens: last ? (last.kind === "embed" ? last.stages.reduce((sum, s) => sum + (s.tokens_in ?? 0), 0) : null) : null,
    usd: priced.length ? priced.reduce((sum, s) => sum + (s.usd ?? 0), 0) : null,
    identifiersSent: identifiersSent(trace),
  };
}
