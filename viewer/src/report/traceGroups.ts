/**
 * A pipeline's calls as the tree tracing tools show: the run at the root, each step under
 * it, and a step the pipeline took by calling one component several times in a row, such
 * as a loader once a file, opening onto those calls.
 */
import type { Span } from "./traceTree";
import type { StageIdentifier, StageWarning, Trace, TraceStage } from "./traceTypes";

const sum = (values: (number | null | undefined)[]): number | null => {
  const counted = values.filter((v): v is number => typeof v === "number");
  return counted.length ? counted.reduce((a, b) => a + b, 0) : null;
};

function union(stages: TraceStage[]): StageIdentifier[] {
  return [...new Map(stages.flatMap((s) => s.identifiers).map((i) => [i.fingerprint, i])).values()];
}

/** A stage standing for several: its time from the first start to the last end, its figures summed. */
function standIn(stages: TraceStage[], fields: Partial<TraceStage> & Pick<TraceStage, "index">): TraceStage {
  const first = stages[0] as TraceStage;
  const start = Math.min(...stages.map((s) => s.started ?? 0));
  const end = Math.max(...stages.map((s) => (s.started ?? 0) + s.seconds));
  const usd = sum(stages.map((s) => s.usd));
  return {
    ...first,
    seconds: Math.max(0, end - start),
    started: start,
    parameters: {},
    documents_in: sum(stages.map((s) => s.documents_in)),
    documents_out: sum(stages.map((s) => s.documents_out)),
    characters_in: sum(stages.map((s) => s.characters_in)),
    characters_out: sum(stages.map((s) => s.characters_out)),
    tokens_in: sum(stages.map((s) => s.tokens_in)),
    tokens_out: sum(stages.map((s) => s.tokens_out)),
    usd,
    usd_basis: usd === null ? (first.usd_basis ?? null) : "estimated",
    sources: [...new Set(stages.flatMap((s) => s.sources))],
    identifiers: union(stages),
    hidden: sum(stages.map((s) => s.hidden)),
    connections: [...new Set(stages.flatMap((s) => s.connections))],
    hosts: [...new Set(stages.flatMap((s) => s.hosts))],
    vectors: sum(stages.map((s) => s.vectors)),
    previews: [],
    documents: [],
    warnings: [],
    traceback: null,
    finished: stages.every((s) => s.finished),
    error: stages.find((s) => s.error)?.error ?? null,
    parent: null,
    ...fields,
  };
}

/** The stages of `spans` and of every span inside them. */
const within = (spans: Span[]): TraceStage[] => spans.flatMap((s) => [s.stage, ...within(s.children)]);

/** What went wrong anywhere under a row the viewer made, said once each. */
function warningsIn(spans: Span[]): StageWarning[] {
  const seen = new Map<string, StageWarning>();
  for (const stage of within(spans))
    for (const warning of stage.warnings ?? []) seen.set(`${stage.index}:${warning.code}`, warning);
  return [...seen.values()];
}

const deepen = (span: Span, depth: number): Span => ({
  ...span,
  depth,
  children: span.children.map((child) => deepen(child, depth + 1)),
});

/** Consecutive calls of one component, the same kind and method, as one step of several calls. */
function steps(spans: Span[], next: () => number): Span[] {
  const runs: Span[][] = [];
  for (const span of spans) {
    const last = runs[runs.length - 1];
    const previous = last?.[last.length - 1]?.stage;
    const { stage } = span;
    if (
      last &&
      previous &&
      previous.kind === stage.kind &&
      previous.component === stage.component &&
      previous.method === stage.method
    )
      last.push(span);
    else runs.push([span]);
  }
  return runs.map((calls) => {
    const first = calls[0] as Span;
    if (calls.length === 1) return first;
    const stage = standIn(
      calls.map((c) => c.stage),
      {
        index: next(),
        method: "calls",
        parameters: { calls: calls.length, read: calls.map((c) => c.label) },
        warnings: warningsIn(calls),
      },
    );
    return { stage, depth: 0, label: `${calls.length} calls`, children: calls };
  });
}

/** The run at the root and its steps under it, with every level set to its depth. */
export function underRun(trace: Trace, spans: Span[]): Span[] {
  if (spans.length === 0) return spans;
  let index = -1;
  const next = () => index--;
  const children = steps(spans, next);
  const last = [...spans].reverse().find((s) => s.stage.kind !== "custom") ?? spans[spans.length - 1];
  const stages = spans.map((s) => s.stage);
  const root = standIn(stages, {
    index: next(),
    kind: "run",
    component: trace.name,
    module: "complydoc.observe",
    method: "run",
    parameters: { steps: children.length },
    // What the run passed on is what its last step did.
    identifiers: last?.stage.identifiers ?? [],
    scanned: last?.stage.scanned ?? "off",
    documents_in: null,
    documents_out: null,
    characters_in: null,
    characters_out: null,
    tokens_in: null,
    tokens_out: null,
    vectors: null,
    warnings: warningsIn(spans),
  });
  return [deepen({ stage: root, depth: 0, label: "", children }, 0)];
}
