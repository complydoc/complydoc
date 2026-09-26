import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useModelChoice } from "@/hooks/useModelChoice";
import { PlanContext } from "@/hooks/usePlan";
import { loaderChoices, planOptions, type Method } from "@/report/plan";
import { PLAN_KEYS, loadersFor, methodFor, storedChoice, storedLoaders as parseLoaders } from "@/report/planChoice";
import { pricedModels } from "@/report/pricing";
import type { Report } from "@/report/types";

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the choice lasts until the page closes.
  }
}

/** The loading plan every page of an opened report is priced and timed under. */
export function PlanProvider({ report, children }: { report: Report; children: ReactNode }) {
  const models = useMemo(() => pricedModels(report), [report]);
  const choices = useMemo(() => loaderChoices(report), [report]);
  const choice = useModelChoice(models);
  const [storedMethod, setStoredMethod] = useState(() => storedChoice(PLAN_KEYS.method));
  const [storedLoaders, setStoredLoaders] = useState(() => storedChoice(PLAN_KEYS.loaders));

  // Remembered choices this report cannot honour fall back: a loader it did not run to the
  // one it kept, a method it cannot read with to the one complydoc recommends.
  const loaders = useMemo(() => loadersFor(report, storedLoaders), [report, storedLoaders]);
  const options = useMemo(() => planOptions(report, loaders), [report, loaders]);
  const method = useMemo(() => methodFor(report, storedMethod, loaders), [report, storedMethod, loaders]);

  const chooseMethod = useCallback((id: Method) => {
    setStoredMethod(id);
    remember(PLAN_KEYS.method, id);
  }, []);
  const chooseLoader = useCallback((format: string, reader: string) => {
    setStoredLoaders((current) => {
      const next = JSON.stringify({ ...parseLoaders(current), [format]: reader });
      remember(PLAN_KEYS.loaders, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      plan: { method, loaders, text: choice.text, vision: choice.vision },
      options,
      loaderChoices: choices,
      models,
      choice,
      chooseMethod,
      chooseLoader,
    }),
    [method, loaders, choice, options, choices, models, chooseMethod, chooseLoader],
  );
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}
