import type { ReactNode } from "react";
import { EvalsContext, useEvals } from "@/hooks/useEvals";

/** The evals file of the folder a run read, for every page under it. */
export function EvalsProvider({ source, children }: { source?: string; children: ReactNode }) {
  const state = useEvals(source);
  return <EvalsContext.Provider value={state}>{children}</EvalsContext.Provider>;
}
