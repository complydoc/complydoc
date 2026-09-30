/**
 * Each document of a pipeline's run, followed from the loader that read it to where it
 * was sent: what every step did with it, the identifiers it gained or lost on the way,
 * and what was wrong with it.
 */
import type { StageDocument, StageIdentifier, StageWarning, Trace, TraceStage } from "./traceTypes";

export interface DocumentStep {
  stage: TraceStage;
  entry: StageDocument;
  /** Identifiers it holds here that it did not at the step before. */
  entered: string[];
  /** Identifiers it held at the step before that it does not here. */
  left: string[];
  warnings: StageWarning[];
}

export interface Journey {
  source: string;
  steps: DocumentStep[];
  warnings: StageWarning[];
  /** Where its text went, and the identifiers in what went there. */
  sent: { hosts: string[]; identifiers: string[] } | null;
}

/** Every document the run's stages named, in the order they first did. */
export function journeys(trace: Trace): Journey[] {
  const stages = [...trace.stages].sort((a, b) => (a.started ?? 0) - (b.started ?? 0) || a.index - b.index);
  const byParent = new Map<number, TraceStage[]>();
  for (const stage of trace.stages)
    if (stage.parent !== null && stage.parent !== undefined)
      byParent.set(stage.parent, [...(byParent.get(stage.parent) ?? []), stage]);

  const found = new Map<string, DocumentStep[]>();
  for (const stage of stages)
    for (const entry of stage.documents ?? []) {
      // A directory loader passes on what the loader it ran for the file read: that one
      // step is shown, not both.
      const inner = (byParent.get(stage.index) ?? []).some(
        (child) => child.kind === stage.kind && child.documents?.some((d) => d.source === entry.source),
      );
      if (inner) continue;
      const steps = found.get(entry.source) ?? [];
      const before = steps[steps.length - 1]?.entry.identifiers ?? [];
      steps.push({
        stage,
        entry,
        entered: steps.length ? entry.identifiers.filter((i) => !before.includes(i)) : [],
        left: before.filter((i) => !entry.identifiers.includes(i)),
        warnings: (stage.warnings ?? []).filter((w) => w.sources.includes(entry.source)),
      });
      found.set(entry.source, steps);
    }

  return [...found.entries()].map(([source, steps]) => {
    const sending = steps.filter((step) => step.stage.hosts.length > 0);
    return {
      source,
      steps,
      warnings: steps.flatMap((step) => step.warnings),
      sent: sending.length
        ? {
            hosts: [...new Set(sending.flatMap((step) => step.stage.hosts))],
            identifiers: [...new Set(sending.flatMap((step) => step.entry.identifiers))],
          }
        : null,
    };
  });
}

/** Every identifier the run's stages found, by fingerprint, to name one a document held. */
export function identifiersOf(trace: Trace): Map<string, StageIdentifier> {
  return new Map(trace.stages.flatMap((stage) => stage.identifiers.map((i) => [i.fingerprint, i] as const)));
}
