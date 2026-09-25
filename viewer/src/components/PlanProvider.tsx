import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useModelChoice } from "@/hooks/useModelChoice";
import { PlanContext } from "@/hooks/usePlan";
import { planOptions, type ReaderChoice } from "@/report/plan";
import { pricedModels } from "@/report/pricing";
import type { Report } from "@/report/types";

const KEY = "complydoc-plan-reader";

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The loading plan every page of an opened report is priced and timed under. */
export function PlanProvider({ report, children }: { report: Report; children: ReactNode }) {
  const models = useMemo(() => pricedModels(report), [report]);
  const options = useMemo(() => planOptions(report), [report]);
  const choice = useModelChoice(models);
  const [reader, setReader] = useState(stored);

  const chooseReader = useCallback((id: ReaderChoice) => {
    setReader(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Blocked storage: the choice lasts until the page closes.
    }
  }, []);

  // A remembered reader this report did not run falls back to the one it kept.
  const current = options.find((o) => o.id === reader)?.id ?? "kept";
  const value = useMemo(
    () => ({
      plan: { reader: current, text: choice.text, vision: choice.vision },
      options,
      models,
      choice,
      chooseReader,
    }),
    [current, choice, options, models, chooseReader],
  );
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}
