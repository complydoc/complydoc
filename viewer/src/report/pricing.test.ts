import { required, sampleAudit, sampleReport } from "@/test/sample";
import { byProvider, imagePrice, matchWords, pricedModels, textPrice } from "./pricing";

describe("pricing a page", () => {
  const report = sampleAudit();
  const models = pricedModels(report);
  const page = required(report.documents[0]?.extracted_text[0], "a page");
  const first = required(models[0], "a priced model");

  it("lists every priced model, and knows which take images", () => {
    expect(models.length).toBeGreaterThan(5);
    expect(models.some((m) => m.vision)).toBe(true);
    expect(models.some((m) => !m.vision)).toBe(true);
    expect(models.every((m) => m.tokenizer)).toBe(true);
  });

  it("groups models by provider, in the order they first appear", () => {
    const groups = byProvider(models);
    expect(groups[0]?.[0]).toBe(models[0]?.provider);
    expect(groups.flatMap(([, group]) => group)).toHaveLength(models.length);
  });

  it("prices each reader's text by its own token count", () => {
    const model = first;
    const kept = textPrice(page, "pdfplumber", model);
    const other = textPrice(page, "pypdf", model);
    expect(kept?.tokens).toBe(page.tokens?.pdfplumber?.[model.tokenizer]);
    expect(kept?.usd).toBeCloseTo(((kept?.tokens ?? 0) / 1e6) * model.inputPerMtok);
    expect(other).not.toBeNull();
  });

  it("prices the page as an image only on a model that takes images", () => {
    const vision = required(models.find((m) => m.vision), "a vision model");
    const text = required(models.find((m) => !m.vision), "a text-only model");
    expect(imagePrice(page, vision)?.usd).toBeGreaterThan(0);
    expect(imagePrice(page, text)).toBeNull();
  });

  it("says nothing for a reader the report did not count", () => {
    expect(textPrice(page, "no-such-reader", first)).toBeNull();
  });

  it("prices loader readings, which have no page size to price an image by", () => {
    const loaders = sampleReport();
    const counted = loaders.documents.flatMap((d) => d.extracted_text).find((p) => p.tokens?.pypdf);
    if (!counted) throw new Error("no counted page");
    const priced = pricedModels(loaders);
    expect(textPrice(counted, "pypdf", required(priced[0], "a priced model"))).not.toBeNull();
    expect(imagePrice(counted, required(priced.find((m) => m.vision), "a vision model"))).toBeNull();
  });
});

describe("searching models", () => {
  it("matches every word typed, not scattered letters", () => {
    expect(matchWords("GPT-5.6 Luna OpenAI gpt-5.6-luna", "luna")).toBe(1);
    expect(matchWords("Claude Sonnet 5 Anthropic claude-sonnet-5", "luna")).toBe(0);
    expect(matchWords("Claude Sonnet 5 Anthropic claude-sonnet-5", "anthropic sonnet")).toBe(1);
  });
});
