/**
 * A document as a model receives it whole: a PDF sent as a file, not cut into chunks.
 *
 * Each provider reads a PDF its own way, and says so in its documentation:
 * Anthropic and OpenAI send each page's extracted text with an image of the page,
 * Gemini counts a flat 258 tokens a page and, on Gemini 3, does not charge for the
 * text. A provider that does not say how it reads a PDF is left out, not guessed at.
 */
import type { DocumentEntry, ModelCost, Report } from "./types";

interface PdfReading {
  /** Whether each page's extracted text is sent, and charged, beside its image. */
  text: boolean;
  /** Tokens a page counts as, where the provider charges a flat amount; else the image formula's count. */
  perPage?: number;
  /** The most pages one request takes, for a context window of this size. */
  pageLimit?: (window: number) => number;
}

const PDF_READING: Record<string, PdfReading> = {
  anthropic: { text: true, pageLimit: (window) => (window >= 1_000_000 ? 600 : 100) },
  openai: { text: true },
  gemini: { text: false, perPage: 258 },
};

export interface WholeDocument {
  id: string;
  name: string;
  provider: string;
  /** Input tokens for the whole file, or null where a page could not be counted. */
  tokens: number | null;
  /** US dollars of input for one request carrying the file. */
  usd: number | null;
  window: number | null;
  /** Why the file does not go in one request; null when it does, or cannot be told. */
  tooLong: string | null;
}

const compact = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : `${n}`;

/** What sending `document` whole costs on each model that takes a PDF, by provider, then cheapest first. */
export function wholeDocument(report: Report, document: DocumentEntry): WholeDocument[] {
  const pages = document.extracted_text;
  if (!pages.length) return [];
  const models = (report.cost?.models ?? []).filter(
    (m): m is ModelCost & { input_per_mtok_usd: number } =>
      Boolean(m.accepts_pdf) && typeof m.input_per_mtok_usd === "number" && m.provider in PDF_READING,
  );
  const rows = models.map((model): WholeDocument => {
    const reading = PDF_READING[model.provider] ?? { text: false };
    let tokens: number | null = 0;
    for (const page of pages) {
      const image = reading.perPage ?? (model.vision_formula ? page.image_tokens?.[model.vision_formula] : undefined);
      // A scanned page has no text for the provider to extract: it sends the image alone.
      const reader = page.kept || report.run.extractor;
      const text = reading.text && page.source !== "ocr" ? page.tokens?.[reader]?.[model.tokenizer ?? ""] : 0;
      if (image === undefined || text === undefined || tokens === null) {
        tokens = null;
        continue;
      }
      tokens += image + text;
    }
    const window = model.max_input_tokens ?? null;
    const limit = window && reading.pageLimit ? reading.pageLimit(window) : null;
    let tooLong: string | null = null;
    if (limit !== null && pages.length > limit) tooLong = `${pages.length} pages; a request takes ${limit}`;
    else if (tokens !== null && window !== null && tokens > window)
      tooLong = `${compact(tokens)} tokens; the window is ${compact(window)}`;
    return {
      id: model.model_id,
      name: model.display_name,
      provider: model.provider,
      tokens,
      usd: tokens === null ? null : (tokens / 1_000_000) * model.input_per_mtok_usd,
      window,
      tooLong,
    };
  });
  const order = [...new Set(rows.map((r) => r.provider))];
  return rows.sort(
    (a, b) =>
      order.indexOf(a.provider) - order.indexOf(b.provider) ||
      (a.usd ?? Infinity) - (b.usd ?? Infinity) ||
      a.name.localeCompare(b.name),
  );
}

/** "18K · 2% of 1M": the file's tokens, and how much of the window they take. */
export function windowShare(row: WholeDocument): string | null {
  if (row.tokens === null) return null;
  if (!row.window) return `${compact(row.tokens)} tokens`;
  const share = (row.tokens / row.window) * 100;
  return `${compact(row.tokens)} · ${share < 1 ? "<1" : Math.round(share)}% of ${compact(row.window)}`;
}
