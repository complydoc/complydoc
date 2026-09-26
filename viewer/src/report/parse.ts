import type { Report, Thresholds } from "./types";

/** The report schemas this viewer was written against. */
const SUPPORTED_SCHEMAS = [15, 16, 17] as const;

/**
 * The lines complydoc drew before reports carried them (schemas 15 and 16, and
 * early 17). A record of what those reports were judged by, not a rule of the
 * viewer's: a newer report brings its own.
 */
const EARLIER_THRESHOLDS: Thresholds = {
  bands: { ready: 75, workable: 50, "needs work": 25, "not ready": 0 },
  similar_enough: 0.95,
};

export class ReportError extends Error {
  override name = "ReportError";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Turn the text of a report file into a Report, or say plainly why it is not one.
 *
 * Checks the shape the viewer depends on, not every field: the report is
 * written by complydoc, so the question is whether this is one, and which version.
 */
export function parseReport(text: string): Report {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ReportError("This file is not JSON.");
  }
  if (!isObject(data) || !isObject(data.run) || !isObject(data.overall)) {
    throw new ReportError("This JSON is not a complydoc report.");
  }
  const schema = data.run.schema_version;
  if (typeof schema !== "number" || !SUPPORTED_SCHEMAS.includes(schema as (typeof SUPPORTED_SCHEMAS)[number])) {
    throw new ReportError(
      `This report uses schema ${String(schema)}. The viewer reads schema ${SUPPORTED_SCHEMAS.join(", ")}.`,
    );
  }
  if (!Array.isArray(data.documents)) {
    throw new ReportError("This report has no document list.");
  }
  const report = {
    loader_comparison: null,
    cost: null,
    verification: null,
    thresholds: EARLIER_THRESHOLDS,
    ...data,
  } as unknown as Report;
  // A run that did not scan for identifiers leaves these null; the pages read them as none found,
  // and say from `run.components_run` that the scan was not part of the run.
  for (const document of report.documents as unknown as Record<string, unknown>[]) {
    document.sensitive ??= { matches: [] };
    document.content_findings ??= [];
  }
  return report;
}
