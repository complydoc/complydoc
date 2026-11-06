import { sampleAudit } from "@/test/sample";
import type { DocumentEntry, ModelCost, PageText, Report } from "./types";
import { wholeDocument, windowShare } from "./wholeDocument";

const model = (provider: string, id: string, window: number, extra: Partial<ModelCost> = {}): ModelCost => ({
  model_id: id,
  display_name: id,
  provider,
  architectures: [],
  input_per_mtok_usd: 1,
  vision_formula: `${provider}-formula`,
  tokenizer: "count",
  max_input_tokens: window,
  accepts_pdf: true,
  ...extra,
});

function withPages(count: number, models: ModelCost[], source: PageText["source"] = "native"): [Report, DocumentEntry] {
  const report = sampleAudit();
  const document = report.documents[0] as DocumentEntry;
  const page = document.extracted_text[0] as PageText;
  const pages = Array.from({ length: count }, (_, i) => ({
    ...page,
    number: i + 1,
    source,
    kept: "reader",
    tokens: { reader: { count: 1_000 } },
    image_tokens: { "anthropic-formula": 1_600, "openai-formula": 800 },
  }));
  const shaped = { ...document, extracted_text: pages };
  return [{ ...report, cost: { currency: "USD", models }, documents: [shaped] }, shaped];
}

describe("wholeDocument", () => {
  it("counts each page as the provider reads a PDF", () => {
    const [report, document] = withPages(10, [
      model("anthropic", "claude", 1_000_000),
      model("gemini", "gemini", 1_048_576),
      model("openai", "gpt", 400_000),
    ]);
    const rows = wholeDocument(report, document);
    expect(rows.map((r) => [r.id, r.tokens])).toEqual([
      ["claude", 26_000],
      ["gemini", 2_580],
      ["gpt", 18_000],
    ]);
    const [claude] = rows;
    expect(claude?.usd).toBeCloseTo(0.026);
    expect(claude && windowShare(claude)).toBe("26K · 3% of 1M");
  });

  it("sends a scanned page as its image alone", () => {
    const [report, document] = withPages(2, [model("anthropic", "claude", 1_000_000)], "ocr");
    expect(wholeDocument(report, document)[0]?.tokens).toBe(3_200);
  });

  it("says when a file does not go in one request, by pages or by tokens", () => {
    const [report, document] = withPages(150, [
      model("anthropic", "claude-200k", 200_000),
      model("openai", "gpt", 100_000),
    ]);
    const [claude, gpt] = wholeDocument(report, document);
    expect(claude?.tooLong).toBe("150 pages; a request takes 100");
    expect(gpt?.tooLong).toBe("270K tokens; the window is 100K");
  });

  it("leaves out a model that takes no PDF, or whose provider does not say how it reads one", () => {
    const [report, document] = withPages(1, [
      model("anthropic", "no-pdf", 1_000_000, { accepts_pdf: false }),
      model("zai", "glm", 1_000_000),
    ]);
    expect(wholeDocument(report, document)).toEqual([]);
  });
});
