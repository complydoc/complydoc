/**
 * The plan chosen in the top bar, as this browser remembers it.
 *
 * Kept by name rather than by object, so the same choice applies to every
 * report open: the overview prices each folder on the model and reader chosen,
 * wherever that report lists them.
 */
import { planOptions, type Plan, type ReaderChoice } from "./plan";
import { pricedModels } from "./pricing";
import type { Report } from "./types";

export const PLAN_KEYS = {
  reader: "complydoc-plan-reader",
  text: "complydoc-model-text",
  vision: "complydoc-model-vision",
} as const;

export function storedChoice(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The remembered plan, applied to one report: its own models, the chosen ones where it has them. */
export function planFor(report: Report): Plan {
  const models = pricedModels(report);
  const visionModels = models.filter((m) => m.vision);
  const reader = storedChoice(PLAN_KEYS.reader);
  const textId = storedChoice(PLAN_KEYS.text);
  const visionId = storedChoice(PLAN_KEYS.vision);
  return {
    reader: (planOptions(report).find((o) => o.id === reader)?.id ?? "kept") as ReaderChoice,
    text: models.find((m) => m.id === textId) ?? models[0] ?? null,
    vision: visionModels.find((m) => m.id === visionId) ?? visionModels[0] ?? null,
  };
}
