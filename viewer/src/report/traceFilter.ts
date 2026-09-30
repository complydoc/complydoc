/**
 * The calls of a trace narrowed to those that match, each kept under the calls it ran in,
 * as tracing tools filter a span tree.
 */
import type { Span } from "./traceTree";

export interface SpanFilter {
  /** Matched against a call's component and what it read, ignoring case. */
  query: string;
  /** Only calls that passed on an identifier. */
  identifiers: boolean;
  /** Only calls with a warning or an error. */
  problems: boolean;
}

export const NO_FILTER: SpanFilter = { query: "", identifiers: false, problems: false };

export const filtering = (filter: SpanFilter) => Boolean(filter.query.trim()) || filter.identifiers || filter.problems;

function matches(span: Span, filter: SpanFilter): boolean {
  const { stage } = span;
  // A row the viewer made, the run or a step of several calls, is kept for what it holds.
  if (stage.index < 0) return false;
  const query = filter.query.trim().toLowerCase();
  if (query && !`${stage.component} ${span.label}`.toLowerCase().includes(query)) return false;
  if (filter.identifiers && stage.identifiers.length === 0) return false;
  if (filter.problems && !stage.error && (stage.warnings?.length ?? 0) === 0) return false;
  return true;
}

/** `roots` with only the calls that match and the calls they ran in; all of it without a filter. */
export function filterSpans(roots: Span[], filter: SpanFilter): Span[] {
  if (!filtering(filter)) return roots;
  return roots.flatMap((span) => {
    const children = filterSpans(span.children, filter);
    return matches(span, filter) || children.length > 0 ? [{ ...span, children }] : [];
  });
}
