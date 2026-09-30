/**
 * A trace as the Pipeline page shows it. A pipeline that loads files one at a time
 * calls its loader once a file, which the trace records as a stage each; the page
 * shows them as one step, the calls counted. Between steps, what changed; and for
 * each identifier, which steps it was in.
 */
import type { StageIdentifier, Trace, TraceStage } from "./traceTypes";

export type StepKind = TraceStage["kind"];
export type Scanned = TraceStage["scanned"];

export interface Step {
  /** Position among the steps, from 0. */
  index: number;
  kind: StepKind;
  component: string;
  module: string;
  method: string;
  stages: TraceStage[];
  /** Settings every call had the same; those that differed, by name, with how many values. */
  parameters: Record<string, unknown>;
  varying: Record<string, number>;
  documentsIn: number | null;
  documentsOut: number | null;
  charactersIn: number | null;
  charactersOut: number | null;
  seconds: number;
  /** The weakest scan any call had: a step is only as searched as its least searched call. */
  scanned: Scanned;
  identifiers: StageIdentifier[];
  hidden: number | null;
  metadataKeys: string[];
  metadataKeysAdded: string[];
  pathKeys: string[];
  connections: string[];
  hosts: string[];
  vectors: number | null;
  dimensions: number | null;
  /** The report's `chunks` entries this step's calls made. */
  chunks: number[];
  errors: string[];
  finished: boolean;
  sources: string[];
}

const SCAN_ORDER: Scanned[] = ["off", "patterns", "full"];

const sum = (values: (number | null)[]): number | null =>
  values.every((v) => v === null) ? null : values.reduce<number>((total, v) => total + (v ?? 0), 0);

const union = (lists: string[][]): string[] => [...new Set(lists.flat())];

function merged(stages: TraceStage[]): StageIdentifier[] {
  const found = new Map<string, StageIdentifier>();
  for (const stage of stages)
    for (const identifier of stage.identifiers) {
      const seen = found.get(identifier.fingerprint);
      found.set(
        identifier.fingerprint,
        seen ? { ...seen, occurrences: seen.occurrences + identifier.occurrences } : { ...identifier },
      );
    }
  return [...found.values()];
}

function step(index: number, stages: TraceStage[]): Step {
  const first = stages[0] as TraceStage;
  const names = union(stages.map((s) => Object.keys(s.parameters)));
  const parameters: Record<string, unknown> = {};
  const varying: Record<string, number> = {};
  for (const name of names) {
    const values = new Set(stages.map((s) => JSON.stringify(s.parameters[name] ?? null)));
    if (values.size === 1) parameters[name] = first.parameters[name];
    else varying[name] = values.size;
  }
  return {
    index,
    kind: first.kind,
    component: first.component,
    module: first.module,
    method: first.method,
    stages,
    parameters,
    varying,
    documentsIn: sum(stages.map((s) => s.documents_in)),
    documentsOut: sum(stages.map((s) => s.documents_out)),
    charactersIn: sum(stages.map((s) => s.characters_in)),
    charactersOut: sum(stages.map((s) => s.characters_out)),
    seconds: stages.reduce((total, s) => total + s.seconds, 0),
    scanned: SCAN_ORDER[Math.min(...stages.map((s) => SCAN_ORDER.indexOf(s.scanned)))] ?? "off",
    identifiers: merged(stages),
    hidden: sum(stages.map((s) => s.hidden)),
    metadataKeys: union(stages.map((s) => s.metadata_keys)),
    metadataKeysAdded: union(stages.map((s) => s.metadata_keys_added)),
    pathKeys: union(stages.map((s) => s.path_keys)),
    connections: union(stages.map((s) => s.connections)),
    hosts: union(stages.map((s) => s.hosts)),
    vectors: sum(stages.map((s) => s.vectors)),
    dimensions: stages.find((s) => s.dimensions !== null)?.dimensions ?? null,
    chunks: stages.flatMap((s) => (s.chunks === null ? [] : [s.chunks])),
    errors: stages.flatMap((s) => (s.error ? [s.error] : [])),
    finished: stages.every((s) => s.finished),
    sources: union(stages.map((s) => s.sources)),
  };
}

/** The trace's stages as steps: calls one after another of the same component and method are one. */
export function stepsOf(trace: Trace): Step[] {
  const groups: TraceStage[][] = [];
  // The steps are what the pipeline itself called; a call made inside one is part of it.
  for (const stage of trace.stages.filter((s) => s.parent === null || s.parent === undefined)) {
    const last = groups[groups.length - 1];
    const previous = last?.[last.length - 1];
    if (
      last &&
      previous &&
      previous.kind === stage.kind &&
      previous.component === stage.component &&
      previous.method === stage.method
    )
      last.push(stage);
    else groups.push([stage]);
  }
  return groups.map((stages, index) => step(index, stages));
}

/** Whether a step could have seen an identifier: it looked, and looked the way that finds it. */
function couldSee(step: Step, identifier: StageIdentifier): boolean {
  if (step.scanned === "off") return false;
  return step.scanned === "full" || identifier.evidence !== "model";
}

export interface Change {
  /** Identifiers in the step's output the step before did not pass on, and the other way. */
  entered: StageIdentifier[];
  left: StageIdentifier[];
  /** How the text's length moved, as a share of what the step before passed on. */
  text: number | null;
  pathKeysRemoved: string[];
  pathKeysAdded: string[];
  keysAdded: string[];
}

/** What a step changed against the one before it, counting only what both could see. */
export function changeBetween(before: Step, after: Step): Change {
  const both = (identifier: StageIdentifier) => couldSee(before, identifier) && couldSee(after, identifier);
  const had = new Set(before.identifiers.map((i) => i.fingerprint));
  const has = new Set(after.identifiers.map((i) => i.fingerprint));
  const passedOn = after.kind === "embed" || after.kind === "store" ? after.charactersIn : after.charactersOut;
  return {
    entered: after.identifiers.filter((i) => !had.has(i.fingerprint) && both(i)),
    left: before.identifiers.filter((i) => !has.has(i.fingerprint) && both(i)),
    text:
      passedOn !== null && before.charactersOut !== null && before.charactersOut > 0
        ? (passedOn - before.charactersOut) / before.charactersOut
        : null,
    pathKeysRemoved: before.pathKeys.filter((key) => !after.pathKeys.includes(key) && after.kind !== "embed"),
    pathKeysAdded: after.pathKeys.filter((key) => !before.pathKeys.includes(key)),
    keysAdded: after.metadataKeysAdded,
  };
}

export interface Trail {
  identifier: StageIdentifier;
  /** Per step: its occurrences there, 0 where absent, or null where the step could not have seen it. */
  cells: (number | null)[];
  /** Whether it reached the last step, which for most pipelines is what was sent out. */
  reachedEnd: boolean;
}

const SEVERITY = { high: 0, medium: 1, low: 2 } as const;

/** Every identifier the pipeline met, and where along it each was: those that reached the end first. */
export function trailsOf(steps: Step[]): Trail[] {
  const all = new Map<string, StageIdentifier>();
  for (const s of steps)
    for (const identifier of s.identifiers)
      if (!all.has(identifier.fingerprint)) all.set(identifier.fingerprint, identifier);
  const last = steps[steps.length - 1];
  return [...all.values()]
    .map((identifier) => {
      const cells = steps.map((s) =>
        couldSee(s, identifier)
          ? (s.identifiers.find((i) => i.fingerprint === identifier.fingerprint)?.occurrences ?? 0)
          : null,
      );
      return { identifier, cells, reachedEnd: last ? (cells[cells.length - 1] ?? 0) > 0 : false };
    })
    .sort(
      (a, b) =>
        Number(b.reachedEnd) - Number(a.reachedEnd) ||
        SEVERITY[a.identifier.severity] - SEVERITY[b.identifier.severity] ||
        a.identifier.label.localeCompare(b.identifier.label),
    );
}

/** The step that sent text off the machine, if one did: the one with hosts, the last first. */
export function sendingStep(steps: Step[]): Step | undefined {
  return [...steps].reverse().find((s) => s.hosts.length > 0);
}

/** Settings worth naming when two runs of a pipeline are set side by side: how it split. */
const SHAPING = ["chunk_size", "chunk_overlap"];

/** A pipeline's steps in a line, with the settings that most change what it makes. */
export function pipelineShape(trace: Trace): string {
  return stepsOf(trace)
    .map((step) => {
      const settings = SHAPING.filter((name) => name in step.parameters).map(
        (name) => `${name} ${String(step.parameters[name])}`,
      );
      return settings.length > 0 ? `${step.component} (${settings.join(", ")})` : step.component;
    })
    .join(" → ");
}

/** Identifiers in what the pipeline sent off the machine; null where nothing was sent or it was not scanned. */
export function identifiersSent(trace: Trace): number | null {
  const step = sendingStep(stepsOf(trace));
  return step && step.scanned !== "off" ? step.identifiers.length : null;
}
