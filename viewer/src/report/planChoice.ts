/**
 * The plan chosen in the top bar, as this browser remembers it.
 *
 * Kept by name rather than by object, so the same choice applies to every
 * report open: the overview prices each folder on the model and reader chosen,
 * wherever that report lists them.
 */
import { planOptions, type Plan, type ReaderChoice } from "./plan";
import { pricedModels, type PricedModel } from "./pricing";
import type { Report } from "./types";

export const PLAN_KEYS = {
  reader: "complydoc-plan-reader",
  text: "complydoc-model-text",
  vision: "complydoc-model-vision",
  /** The provider of the chosen model, for a report that did not price that model itself. */
  textProvider: "complydoc-provider-text",
  visionProvider: "complydoc-provider-vision",
} as const;

/**
 * The preferred model among a report's, or the nearest to it: the model itself;
 * else the report's cheapest from the same provider, since preferring a provider
 * is most of what preferring a model says; else the report's first.
 */
export function preferred(models: PricedModel[], id: string | null, provider: string | null): PricedModel | null {
  const exact = models.find((m) => m.id === id);
  if (exact) return exact;
  const sameProvider = models.filter((m) => m.provider === provider).sort((a, b) => a.inputPerMtok - b.inputPerMtok);
  return sameProvider[0] ?? models[0] ?? null;
}

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
    text: preferred(models, textId, storedChoice(PLAN_KEYS.textProvider)),
    vision: preferred(visionModels, visionId, storedChoice(PLAN_KEYS.visionProvider)),
  };
}
