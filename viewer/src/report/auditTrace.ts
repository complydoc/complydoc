/**
 * An audit's own run as a trace, built from what the run measured and wrote into each
 * document: when it began to be read, which several worker processes do at once, and how
 * long each reader, OCR, the analysis, the identifier scan and a vision check took. The
 * steps inside a document are laid end to end in the order they run: they are timed, and
 * their starts are not.
 */
import { measured } from "./measured";
import type { StageIdentifier, Trace, TraceStage } from "./traceTypes";
import type { DocumentEntry, Report } from "./types";

const SEVERITY: Record<string, number> = { high: 0, medium: 1, low: 2 };

function identifiers(document: DocumentEntry): StageIdentifier[] {
  const found = new Map<string, StageIdentifier>();
  for (const match of document.sensitive.matches) {
    const key = match.fingerprint || `${match.category}:${match.masked}`;
    const seen = found.get(key);
    found.set(key, {
      fingerprint: key,
      label: match.label,
      masked: match.masked,
      severity: match.severity,
      occurrences: (seen?.occurrences ?? 0) + 1,
      evidence: match.evidence,
    });
  }
  return [...found.values()].sort((a, b) => (SEVERITY[a.severity] ?? 3) - (SEVERITY[b.severity] ?? 3));
}

function stage(fields: Partial<TraceStage> & Pick<TraceStage, "index" | "kind" | "component" | "seconds">): TraceStage {
  return {
    module: "complydoc.audit",
    method: fields.kind,
    tags: [],
    parameters: {},
    documents_in: null,
    documents_out: null,
    characters_in: null,
    characters_out: null,
    sources: [],
    scanned: "off",
    identifiers: [],
    hidden: null,
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
    ...fields,
  };
}

/** Whether the run recorded enough to be read as a trace: documents, each timed. */
function hasAuditTrace(report: Report): boolean {
  return report.documents.length > 0 && report.documents.every((d) => d.timing);
}

function auditTrace(report: Report): Trace | null {
  if (!hasAuditTrace(report)) return null;
  const began = Math.min(...report.documents.map((d) => d.timing?.started_at ?? Number.POSITIVE_INFINITY));
  const scanned = measured(report, "sensitive");
  const stages: TraceStage[] = [];
  let cursor = 0;
  for (const document of report.documents) {
    const timing = document.timing;
    if (!timing) continue;
    const start =
      typeof timing.started_at === "number" && Number.isFinite(began) ? Math.max(0, timing.started_at - began) : cursor;
    cursor = Math.max(cursor, start + timing.total_seconds);
    const found = scanned ? identifiers(document) : [];
    const parent = stages.length;
    stages.push(
      stage({
        index: parent,
        kind: "document",
        component: document.relative_path.split(/[\\/]/).pop() ?? document.relative_path,
        seconds: timing.total_seconds,
        started: start,
        parameters: { path: document.relative_path, format: document.format, pages: document.page_count },
        documents_out: document.page_count,
        characters_out: document.extractions[0]?.characters ?? null,
        sources: [document.relative_path],
        scanned: scanned ? "full" : "off",
        identifiers: found,
        hidden: document.content_findings.length,
      }),
    );
    let at = start;
    const add = (fields: Partial<TraceStage> & Pick<TraceStage, "kind" | "component" | "seconds">) => {
      stages.push(stage({ ...fields, index: stages.length, parent, started: at }));
      at += fields.seconds;
    };
    for (const reading of document.extractions)
      add({
        kind: "read",
        component: reading.extractor,
        seconds: reading.seconds ?? 0,
        characters_out: reading.characters,
      });
    const ocr = document.extracted_text.reduce((sum, page) => sum + (page.seconds?.ocr ?? 0), 0);
    if (ocr) add({ kind: "ocr", component: "OCR", seconds: ocr });
    if (timing.analyse_seconds)
      add({ kind: "analyse", component: "Readiness and cost", seconds: timing.analyse_seconds });
    if (scanned)
      add({
        kind: "scan",
        component: "Identifier scan",
        seconds: timing.scan_seconds,
        scanned: "full",
        identifiers: found,
      });
    const verification = document.verification;
    if (verification) {
      const usd = verification.pages.reduce((sum, page) => sum + (page.cost?.usd ?? 0), 0);
      add({
        kind: "verify",
        component: verification.model,
        seconds: verification.pages.reduce((sum, page) => sum + (page.seconds ?? 0), 0),
        hosts: verification.sent_to,
        usd: usd || null,
        usd_basis: usd ? "estimated" : null,
      });
    }
    // A document spans all its steps. A loader comparison times each loader on its own and
    // the document by its first reading alone, so the steps can run past that time.
    const whole = stages[parent];
    if (whole && at - start > whole.seconds) {
      stages[parent] = { ...whole, seconds: at - start };
      cursor = Math.max(cursor, at);
    }
  }
  return {
    name: report.run.target.split(/[\\/]/).filter(Boolean).pop() ?? report.run.target,
    kind: "audit",
    scan: "full",
    seconds: report.run.duration_seconds,
    overhead_seconds: 0,
    stages,
    connections_outside: [],
    libraries: {},
    error: null,
  };
}

/** The trace a run carries, or for an audit, the one its timings make. */
export function traceOf(report: Report): Trace | null {
  return report.trace ?? auditTrace(report);
}
