import { createContext, useContext } from "react";
import type { PageFinding } from "@/report/pageFindings";
import type { IgnoreRule } from "@/report/types";

export interface IgnoreRequest {
  finding: string;
  reason: string;
  until?: string;
  what?: string;
}

export interface IgnoreState {
  /**
   * Whether what is ignored here is saved: served by `complydoc ui`, with the
   * audited folder on this machine. Otherwise it lasts while the page is open.
   */
  editable: boolean;
  /** The ignore file, when it is known. */
  file: string | null;
  /**
   * What the ignore file holds now. With `complydoc ui`, read from the file, so a
   * finding ignored since the run shows as such; otherwise what the run read.
   */
  entries: IgnoreRule[];
  error: string | null;
  ignore: (request: IgnoreRequest) => Promise<boolean>;
  unignore: (finding: string) => Promise<boolean>;
}

const READ_ONLY: IgnoreState = {
  editable: false,
  file: null,
  entries: [],
  error: null,
  ignore: async () => false,
  unignore: async () => false,
};

export const IgnoreContext = createContext<IgnoreState>(READ_ONLY);

/** The open report's ignore file, and the ways to change it. Read only outside `complydoc ui`. */
export function useIgnores(): IgnoreState {
  return useContext(IgnoreContext);
}

/** The entry that sets `fingerprint` aside today, if any. An expired entry sets nothing aside. */
export function activeEntry(entries: IgnoreRule[], fingerprint: string, today = new Date()): IgnoreRule | undefined {
  const day = today.toISOString().slice(0, 10);
  return entries.find(
    (entry) => entry.finding === fingerprint && !entry.expired && !(entry.until && entry.until < day),
  );
}

/** The command that ignores a finding, for a report opened without `complydoc ui`. */
export function ignoreCommand(fingerprint: string): string {
  return `complydoc ignore ${fingerprint} --reason "…"`;
}

/** Written to the ignore file when a finding is ticked off without a reason typed. */
export const TICKED = "Ticked off as not a problem in the viewer.";

/** Whether a finding counts as ignored right now: by the run's ignore file, or ticked off since. */
export function useIsIgnored(): (finding: PageFinding) => boolean {
  const { editable, entries } = useIgnores();
  return (finding) => {
    if (!finding.fingerprint) return false;
    const listed = activeEntry(entries, finding.fingerprint) !== undefined;
    // One the run set aside stays so, unless the file no longer lists it.
    return finding.ignoredByRun ? !editable || listed : listed;
  };
}
