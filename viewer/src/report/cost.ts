/** What sending the folder to each model costs, arranged for the Cost page. */
import type { CostPath, ModelCost, Report } from "./types";

export const PATHS: readonly { key: CostPath; label: string }[] = [
  { key: "text_ocr", label: "Text + local OCR" },
  { key: "vision", label: "As images" },
  { key: "text_layer", label: "Text layer only" },
];

export function perThousand(model: ModelCost, path: CostPath): number | null {
  return model.architectures.find((a) => a.key === path)?.per_1000_usd ?? null;
}

export interface PricedModel {
  id: string;
  name: string;
  provider: string;
  verified: boolean;
  usd: number;
}

/** Every model with a price on this path, cheapest first. */
export function pricedOn(report: Report, path: CostPath): PricedModel[] {
  return (report.cost?.models ?? [])
    .flatMap((model) => {
      const usd = perThousand(model, path);
      return usd === null
        ? []
        : [{ id: model.model_id, name: model.display_name, provider: model.provider, verified: model.price_source === "verified", usd }];
    })
    .sort((a, b) => a.usd - b.usd || a.name.localeCompare(b.name));
}

/** The cheapest model on a path, or null when none could be priced. */
export function cheapest(report: Report, path: CostPath): PricedModel | null {
  return pricedOn(report, path)[0] ?? null;
}

export interface CostRow {
  id: string;
  name: string;
  provider: string;
  verified: boolean;
  text: number | null;
  vision: number | null;
}

/** One row per model, with what each path costs per thousand documents. */
export function costRows(report: Report): CostRow[] {
  return (report.cost?.models ?? []).map((model) => ({
    id: model.model_id,
    name: model.display_name,
    provider: model.provider,
    verified: model.price_source === "verified",
    text: perThousand(model, "text_ocr"),
    vision: perThousand(model, "vision"),
  }));
}
