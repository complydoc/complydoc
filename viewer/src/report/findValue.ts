/** Where a value went, as `complydoc ui` answers it: every run that held it. */
export interface Trail {
  found: boolean;
  /** What kind of identifier it was found as, such as "IBAN". */
  label: string | null;
  /** The value as reports show it. */
  masked: string | null;
  runs: RunSighting[];
  reports_searched: number;
}

export interface RunSighting {
  /** The report file, as the viewer names its run. */
  report: string;
  /** The pipeline's name, or the folder audited. */
  name: string;
  kind: "pipeline" | "audit";
  started_at: string;
  commit: string | null;
  documents: { path: string; pages: number[]; occurrences: number }[];
  /** Every step of a traced run, in order, the ones that never held the value too. */
  steps: StepSighting[];
  /** The last step that held the value; null for an audit. */
  reached: number | null;
  /** Every host a step holding the value sent its input to. */
  sent_to: string[];
}

export interface StepSighting {
  step: number;
  kind: string;
  component: string;
  calls: number;
  /** How many times the value was in what the step passed on; zero where it was not. */
  occurrences: number;
  hosts: string[];
}

/**
 * Ask the server that served this page where `value` went. The value goes to that
 * server only, which hashes it and searches the reports for the hash; it is not kept.
 */
export async function findValue(value: string): Promise<Trail> {
  const response = await fetch("api/find", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!response.ok) throw new Error((await response.text()) || `${response.status} ${response.statusText}`);
  return (await response.json()) as Trail;
}

/** How a run ended for the value: sent to a host, stopped inside the pipeline, or only read. */
export type Fate = "sent" | "stopped" | "kept" | "read";

export function fate(run: RunSighting): Fate {
  if (run.sent_to.length > 0) return "sent";
  if (run.kind !== "pipeline" || run.reached === null) return "read";
  return run.reached < run.steps.length ? "stopped" : "kept";
}

/** The step a value last reached, as "RecursiveCharacterTextSplitter, step 4 of 6". */
export function reachedLabel(run: RunSighting): string {
  const step = run.steps.find((s) => s.step === run.reached);
  return step ? `${step.component}, step ${step.step} of ${run.steps.length}` : "";
}

/** How many runs sent the value to a host, and how many stopped it first. */
export function tally(trail: Trail): { sent: number; stopped: number } {
  return {
    sent: trail.runs.filter((run) => fate(run) === "sent").length,
    stopped: trail.runs.filter((run) => fate(run) === "stopped").length,
  };
}
