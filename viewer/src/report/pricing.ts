/**
 * One page, priced on a model of the reader's choosing.
 *
 * The report counts every reading of every page in text tokens, once per way of
 * counting, and every page in image tokens, once per provider formula. With a
 * model's price and which count it uses, any reading can be priced on any model
 * the run compared, here, without a second run.
 */
import type { ModelCost, PageText, Report } from "./types";

export interface PricedModel {
  id: string;
  name: string;
  provider: string;
  /** US dollars per million input tokens. */
  inputPerMtok: number;
  vision: boolean;
  /** The key into `PageText.image_tokens`; null for a model that takes no images. */
  formula: string | null;
  /** The key into `PageText.tokens[reader]`. */
  tokenizer: string;
}

/** Every model the run compared that carries a price, in the report's order. */
export function pricedModels(report: Report): PricedModel[] {
  return (report.cost?.models ?? [])
    .filter((m): m is ModelCost & { input_per_mtok_usd: number } => typeof m.input_per_mtok_usd === "number")
    .map((m) => ({
      id: m.model_id,
      name: m.display_name,
      provider: m.provider,
      inputPerMtok: m.input_per_mtok_usd,
      vision: Boolean(m.supports_vision && m.vision_formula),
      formula: m.vision_formula ?? null,
      tokenizer: m.tokenizer ?? "",
    }));
}

/** Models grouped by provider, providers in the order they first appear. */
export function byProvider(models: PricedModel[]): [string, PricedModel[]][] {
  const groups = new Map<string, PricedModel[]>();
  for (const model of models) groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
  return [...groups];
}

export interface PagePrice {
  usd: number;
  tokens: number;
}

/** What sending one reading of the page, as text, to `model` costs. Null where it was not counted. */
export function textPrice(page: PageText, reader: string, model: PricedModel): PagePrice | null {
  const tokens = page.tokens?.[reader]?.[model.tokenizer];
  if (tokens === undefined) return null;
  return { tokens, usd: (tokens / 1_000_000) * model.inputPerMtok };
}

/** What sending the page, as an image, to `model` costs. Null for a model with no images, or a page of unknown size. */
export function imagePrice(page: PageText, model: PricedModel): PagePrice | null {
  if (!model.vision || !model.formula) return null;
  const tokens = page.image_tokens?.[model.formula];
  if (tokens === undefined) return null;
  return { tokens, usd: (tokens / 1_000_000) * model.inputPerMtok };
}

/** "$5.00 / M" — a model's input price as a list shows it. */
export function perMillion(model: PricedModel): string {
  const digits = model.inputPerMtok < 1 ? 3 : 2;
  return `$${model.inputPerMtok.toFixed(digits)} / M`;
}

/**
 * Every word typed appears in the model's name, provider or id. cmdk's default
 * is a fuzzy score, under which "luna" matches "cLaUde … ANthropic".
 */
export function matchWords(value: string, search: string): number {
  const haystack = value.toLowerCase();
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word)) ? 1 : 0;
}
