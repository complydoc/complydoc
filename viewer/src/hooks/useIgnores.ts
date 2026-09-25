import { createContext, useContext } from "react";
import type { IgnoreRule } from "@/report/types";

export interface IgnoreRequest {
  finding: string;
  reason: string;
  until?: string;
  what?: string;
}

export interface IgnoreState {
  /** Whether findings can be set aside from here: served by `complydoc ui`, with the audited folder on this machine. */
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
  return entries.find((entry) => entry.finding === fingerprint && !entry.expired && !(entry.until && entry.until < day));
}

/** The command that ignores a finding, for a report opened without `complydoc ui`. */
export function ignoreCommand(fingerprint: string): string {
  return `complydoc ignore ${fingerprint} --reason "…"`;
}
