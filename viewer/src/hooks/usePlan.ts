import { createContext, useContext } from "react";
import type { ModelChoice } from "@/hooks/useModelChoice";
import type { LoaderChoice, Method, Plan, PlanOption } from "@/report/plan";
import type { PricedModel } from "@/report/pricing";

export interface PlanState {
  plan: Plan;
  options: PlanOption[];
  models: PricedModel[];
  choice: ModelChoice;
  /** The file types a loader can be chosen for. */
  loaderChoices: LoaderChoice[];
  chooseMethod: (id: Method) => void;
  chooseLoader: (format: string, reader: string) => void;
}

export const PlanContext = createContext<PlanState | null>(null);

/** The loading plan every page of the open report is priced and timed under. */
export function usePlan(): PlanState {
  const state = useContext(PlanContext);
  if (!state) throw new Error("usePlan needs a PlanProvider");
  return state;
}
