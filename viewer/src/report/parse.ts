import type { Report } from "./types";

/** The report schemas this viewer was written against. */
export const SUPPORTED_SCHEMAS = [15] as const;

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
  if (typeof schema !== "number" || !SUPPORTED_SCHEMAS.includes(schema as 15)) {
    throw new ReportError(
      `This report uses schema ${String(schema)}. The viewer reads schema ${SUPPORTED_SCHEMAS.join(", ")}.`,
    );
  }
  if (!Array.isArray(data.documents)) {
    throw new ReportError("This report has no document list.");
  }
  return { loader_comparison: null, ...data } as unknown as Report;
}
