/**
 * The plan chosen in the top bar, as this browser remembers it.
 *
 * Kept by name rather than by object, so the same choice applies to every
 * report open: the overview prices each folder on the model and reader chosen,
 * wherever that report lists them.
 */
import { defaultMethod, planOptions, readersByFormat, type Method, type Plan } from "./plan";
import { pricedModels, type PricedModel } from "./pricing";
import type { Report } from "./types";

export const PLAN_KEYS = {
  /** How pages are read. A new key: the old one held reader names this no longer takes. */
  method: "complydoc-plan-method",
  /** The loader chosen per file type, as JSON: `{"pdf": "pypdf"}`. */
  loaders: "complydoc-plan-loaders",
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

/** The loaders remembered, by file type; nothing where the stored value does not read. */
export function storedLoaders(stored: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The remembered loaders, as far as this report read each type with them. */
export function loadersFor(report: Report, stored: string | null): Record<string, string> {
  const chosen = storedLoaders(stored);
  const readers = readersByFormat(report);
  return Object.fromEntries(
    Object.entries(chosen).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && Boolean(readers.get(entry[0])?.includes(entry[1])),
    ),
  );
}

/** The remembered method, where this report can be read that way; else the one to recommend. */
export function methodFor(report: Report, stored: string | null, loaders: Record<string, string> = {}): Method {
  const options = planOptions(report, loaders);
  return options.find((o) => o.id === stored)?.id ?? defaultMethod(options);
}

/** The remembered plan, applied to one report: its own models, the chosen ones where it has them. */
export function planFor(report: Report): Plan {
  const models = pricedModels(report);
  const visionModels = models.filter((m) => m.vision);
  const loaders = loadersFor(report, storedChoice(PLAN_KEYS.loaders));
  const textId = storedChoice(PLAN_KEYS.text);
  const visionId = storedChoice(PLAN_KEYS.vision);
  return {
    method: methodFor(report, storedChoice(PLAN_KEYS.method), loaders),
    loaders,
    text: preferred(models, textId, storedChoice(PLAN_KEYS.textProvider)),
    vision: preferred(visionModels, visionId, storedChoice(PLAN_KEYS.visionProvider)),
  };
}
