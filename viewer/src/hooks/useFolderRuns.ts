import { createContext, useContext } from "react";
import type { Loaded } from "@/report/collections";
import { measured, type Content } from "@/report/measured";

export interface FolderRuns {
  /** Every run of the folder on screen, newest first. */
  runs: Loaded[];
  /** The run on screen. */
  current: string | null;
  open: (run: string) => void;
}

export const FolderRunsContext = createContext<FolderRuns>({ runs: [], current: null, open: () => {} });

/**
 * The newest other run of this folder that holds `content`, and a way to open it: what a
 * page offers before it suggests running a command for something the folder already has.
 */
export function useRunWith(content: Content): { run: Loaded; open: () => void } | null {
  const { runs, current, open } = useContext(FolderRunsContext);
  const run = runs.find((candidate) => candidate.id !== current && measured(candidate.report, content));
  return run ? { run, open: () => open(run.id) } : null;
}
