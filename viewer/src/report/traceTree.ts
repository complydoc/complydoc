/**
 * A trace as a tree of spans, the way a run is read step by step: each call the pipeline
 * made, the calls made inside it beneath, each placed in time against the whole run.
 */
import type { Trace, TraceStage } from "./traceTypes";

export interface Span {
  stage: TraceStage;
  depth: number;
  children: Span[];
  /** A few words saying which call this was: the folder or file it read, where it names one. */
  label: string;
}

/** Settings that say which folder or file a call read, in the order they are looked for. */
const WHERE = ["file_path", "path", "input_dir", "input_files", "web_path", "source"];

/** The folder or file a call read, from its settings, where it names one. */
function where(stage: TraceStage): string {
  for (const key of WHERE) {
    const value = stage.parameters[key];
    if (typeof value === "string" && value) return value;
    if (Array.isArray(value) && value.length > 0) return `${value.length} files`;
  }
  const sources = stage.sources;
  if (stage.kind === "load" && sources.length === 1) return sources[0] ?? "";
  return "";
}

export function spansOf(trace: Trace): Span[] {
  const byParent = new Map<number | null, TraceStage[]>();
  for (const stage of trace.stages) {
    const parent = stage.parent ?? null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), stage]);
  }
  const build = (stage: TraceStage, depth: number): Span => ({
    stage,
    depth,
    label: where(stage),
    children: (byParent.get(stage.index) ?? []).map((child) => build(child, depth + 1)),
  });
  // In the order they began: an audit reads several documents at once, and reports them in
  // the order it finished them.
  const roots = [...(byParent.get(null) ?? [])].sort((a, b) => (a.started ?? 0) - (b.started ?? 0));
  const spans = roots.map((stage) => build(stage, 0));
  // An audit's documents sit in folders, as they do on disk: a thousand of them read as the
  // few folders they are in, each opening onto its own.
  return trace.kind === "audit" ? byFolder(spans) : spans;
}

/** The folder a document span's file is in, as the path's parts. */
function folderParts(span: Span): string[] {
  const path = span.stage.sources[0] ?? String(span.stage.parameters.path ?? "");
  return path.split(/[\\/]/).slice(0, -1).filter(Boolean);
}

/** A span standing for a folder: its documents' time from the first start to the last end. */
function folderSpan(name: string, path: string, children: Span[], index: number): Span {
  const stages = children.map((child) => child.stage);
  const start = Math.min(...stages.map((s) => s.started ?? 0));
  const end = Math.max(...stages.map((s) => (s.started ?? 0) + s.seconds));
  const identifiers = new Map(stages.flatMap((s) => s.identifiers).map((i) => [i.fingerprint, i]));
  const documents = (span: Span): number =>
    span.stage.kind === "document" ? 1 : span.children.reduce((sum, child) => sum + documents(child), 0);
  return {
    depth: 0,
    label: path,
    children,
    stage: {
      index,
      kind: "folder",
      component: `${name}/`,
      module: "complydoc.audit",
      method: "folder",
      seconds: Math.max(0, end - start),
      tags: [],
      parameters: { path, documents: children.reduce((sum, child) => sum + documents(child), 0) },
      documents_in: null,
      documents_out: children.reduce((sum, child) => sum + documents(child), 0),
      characters_in: null,
      characters_out: null,
      sources: [],
      scanned: stages.some((s) => s.scanned !== "off") ? "full" : "off",
      identifiers: [...identifiers.values()],
      hidden: stages.reduce((sum, s) => sum + (s.hidden ?? 0), 0),
      metadata_keys: [],
      metadata_keys_added: [],
      path_keys: [],
      connections: [],
      hosts: [],
      vectors: null,
      dimensions: null,
      chunks: null,
      finished: true,
      error: null,
      started: start,
    },
  };
}

/** Document spans grouped into folder spans by their paths, a folder's depth set anew. */
function byFolder(documents: Span[]): Span[] {
  let next = -1;
  const group = (spans: Span[], level: number, prefix: string[]): Span[] => {
    const loose: Span[] = [];
    const folders = new Map<string, Span[]>();
    for (const span of spans) {
      const parts = folderParts(span);
      const name = parts[level];
      if (name === undefined) loose.push(span);
      else folders.set(name, [...(folders.get(name) ?? []), span]);
    }
    const made = [...folders].map(([name, inside]) =>
      folderSpan(name, [...prefix, name].join("/"), group(inside, level + 1, [...prefix, name]), next--),
    );
    return [...made.sort((a, b) => a.stage.component.localeCompare(b.stage.component)), ...loose];
  };
  const deepen = (span: Span, depth: number): Span => ({
    ...span,
    depth,
    children: span.children.map((child) => deepen(child, depth + 1)),
  });
  return group(documents, 0, []).map((span) => deepen(span, 0));
}

/** The spans in the order they are listed, skipping the children of those folded. */
export function visibleSpans(roots: Span[], folded: Set<number>): Span[] {
  const rows: Span[] = [];
  const walk = (span: Span) => {
    rows.push(span);
    if (!folded.has(span.stage.index)) span.children.forEach(walk);
  };
  roots.forEach(walk);
  return rows;
}

/** How long the run took from its first call to its last one's end, for placing spans in it. */
export function traceSpan(trace: Trace): number {
  const end = Math.max(0, ...trace.stages.map((s) => (s.started ?? 0) + s.seconds));
  return Math.max(end, 1e-6);
}

export interface TraceTotals {
  seconds: number;
  /** Tokens sent to be embedded, where the run embedded anything. */
  tokensEmbedded: number | null;
  usd: number | null;
  /** Whether some step that sent text could not be priced. */
  unpriced: boolean;
  identifiersSent: number | null;
  hosts: string[];
}

export function traceTotals(trace: Trace): TraceTotals {
  const top = trace.stages.filter((s) => s.parent === null || s.parent === undefined);
  const embeds = trace.stages.filter((s) => s.kind === "embed");
  const priced = trace.stages.filter((s) => typeof s.usd === "number");
  // A stage holds the connections of the stages inside it; hosts are counted once.
  const senders = trace.stages.filter(
    (s) => s.hosts.length > 0 && !trace.stages.some((c) => c.parent === s.index && c.hosts.length > 0),
  );
  return {
    seconds: trace.seconds,
    tokensEmbedded: embeds.length ? embeds.reduce((sum, s) => sum + (s.tokens_in ?? 0), 0) : null,
    usd: priced.length ? priced.reduce((sum, s) => sum + (s.usd ?? 0), 0) : null,
    unpriced: trace.stages.some((s) => s.usd_basis === "unpriced"),
    identifiersSent: senders.some((s) => s.scanned !== "off")
      ? new Set(senders.flatMap((s) => s.identifiers.map((i) => i.fingerprint))).size
      : null,
    hosts: [...new Set(top.flatMap((s) => s.hosts))],
  };
}

/**
 * Where the run's time went, by kind of work: the time of every call that made no call of
 * its own, summed by its kind, largest first. A call's time already holds its children's,
 * so only the innermost are counted.
 */
export function timeByKind(trace: Trace): { kind: TraceStage["kind"]; seconds: number; share: number }[] {
  const parents = new Set(trace.stages.map((s) => s.parent).filter((p): p is number => p !== null && p !== undefined));
  const sums = new Map<TraceStage["kind"], number>();
  for (const stage of trace.stages)
    if (!parents.has(stage.index)) sums.set(stage.kind, (sums.get(stage.kind) ?? 0) + stage.seconds);
  const total = [...sums.values()].reduce((sum, seconds) => sum + seconds, 0) || 1;
  return [...sums]
    .map(([kind, seconds]) => ({ kind, seconds, share: seconds / total }))
    .sort((a, b) => b.seconds - a.seconds);
}
