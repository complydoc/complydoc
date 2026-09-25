/** What sending the folder to each model costs, arranged for the Cost page. */
import type { CostPath, ModelCost, Report } from "./types";

/** How complydoc's providers are written, and the palette slot each keeps on every chart. */
const PROVIDERS: Record<string, { name: string; slot: number }> = {
  anthropic: { name: "Anthropic", slot: 1 },
  openai: { name: "OpenAI", slot: 2 },
  gemini: { name: "Gemini", slot: 3 },
  mistral: { name: "Mistral", slot: 4 },
  deepseek: { name: "DeepSeek", slot: 5 },
  zai: { name: "Z.ai", slot: 6 },
  moonshot: { name: "Moonshot", slot: 7 },
  xai: { name: "xAI", slot: 8 },
};
const SLOTS = 8;

export function providerName(provider: string): string {
  return PROVIDERS[provider]?.name ?? provider;
}

/** The colour a provider takes everywhere on the page. One not listed gets a slot from its name. */
export function providerColour(provider: string): string {
  const known = PROVIDERS[provider]?.slot;
  const slot = known ?? ([...provider].reduce((sum, c) => sum + c.charCodeAt(0), 0) % SLOTS) + 1;
  return `var(--provider-${slot})`;
}

/** The providers among some models, in the order they first appear. */
export function providersOf(models: { provider: string }[]): string[] {
  return [...new Set(models.map((m) => m.provider))];
}

export const PATHS: readonly { key: CostPath; label: string }[] = [
  { key: "text_ocr", label: "Text + local OCR" },
  { key: "vision", label: "As images" },
  { key: "text_layer", label: "Text layer only" },
];

/** What a cost is measured against: a thousand documents, or the folder that was audited. */
export type CostUnit = "per_1000" | "folder";

export const UNITS: readonly { key: CostUnit; label: string }[] = [
  { key: "per_1000", label: "Per 1,000 documents" },
  { key: "folder", label: "This folder" },
];

export function perThousand(model: ModelCost, path: CostPath): number | null {
  return model.architectures.find((a) => a.key === path)?.per_1000_usd ?? null;
}

export function costOf(model: ModelCost, path: CostPath, unit: CostUnit): number | null {
  const architecture = model.architectures.find((a) => a.key === path);
  return (unit === "folder" ? architecture?.folder_usd : architecture?.per_1000_usd) ?? null;
}

export interface PricedModel {
  id: string;
  name: string;
  provider: string;
  usd: number;
}

/** Every model with a price on this path, cheapest first. */
export function pricedOn(report: Report, path: CostPath, unit: CostUnit = "per_1000"): PricedModel[] {
  return (report.cost?.models ?? [])
    .flatMap((model) => {
      const usd = costOf(model, path, unit);
      return usd === null
        ? []
        : [{ id: model.model_id, name: model.display_name, provider: model.provider, usd }];
    })
    .sort((a, b) => a.usd - b.usd || a.name.localeCompare(b.name));
}

export interface CostRow {
  id: string;
  name: string;
  provider: string;
  text: number | null;
  vision: number | null;
}

/** One row per model, with what each path costs per thousand documents. */
export function costRows(report: Report): CostRow[] {
  return (report.cost?.models ?? []).map((model) => ({
    id: model.model_id,
    name: model.display_name,
    provider: model.provider,
    text: perThousand(model, "text_ocr"),
    vision: perThousand(model, "vision"),
  }));
}

/**
 * The priced models grouped by provider: providers in the order of their
 * cheapest model, each provider's models cheapest first. With `provider`, that
 * provider's models only.
 */
export function byProvider(report: Report, path: CostPath, unit: CostUnit, provider: string | null = null): PricedModel[] {
  const priced = pricedOn(report, path, unit).filter((m) => provider === null || m.provider === provider);
  const order = providersOf(priced);
  return [...priced].sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider) || a.usd - b.usd);
}
