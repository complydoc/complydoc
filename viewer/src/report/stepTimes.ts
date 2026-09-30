/** Where a run's time went: a pipeline's by step, an audit's by kind of work. */
import { KIND } from "@/features/pipeline/kinds";
import { traceOf } from "./auditTrace";
import { plural } from "./format";
import { measured } from "./measured";
import { timeByKind } from "./traceTree";
import { stepsOf, type StepKind } from "./traceView";
import type { Report } from "./types";

export interface Row {
  name: string;
  detail: string;
  kind: StepKind;
  seconds: number;
}

/** Where a run's time went: a pipeline's by step, an audit's by kind of work. */
export function stepRows(report: Report): Row[] {
  const trace = measured(report, "trace") ? traceOf(report) : null;
  if (!trace) return [];
  if (trace.kind === "audit")
    return timeByKind(trace).map((row) => ({
      name: KIND[row.kind].label,
      detail: "",
      kind: row.kind,
      seconds: row.seconds,
    }));
  return stepsOf(trace).map((step) => ({
    name: step.component,
    detail: step.stages.length > 1 ? plural(step.stages.length, "call") : KIND[step.kind].label,
    kind: step.kind,
    seconds: step.seconds,
  }));
}
