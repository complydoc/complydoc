import { sampleAudit, sampleReport } from "@/test/sample";
import { byProvider, costRows, pricedOn, providerColour, providerName, providersOf } from "./cost";

describe("cost", () => {
  it("lists the priced models on a path, cheapest first", () => {
    const priced = pricedOn(sampleAudit(), "text_ocr");
    expect(priced.length).toBeGreaterThan(1);
    expect(priced.map((m) => m.usd)).toEqual([...priced.map((m) => m.usd)].sort((a, b) => a - b));
  });

  it("finds images dearer than text", () => {
    const report = sampleAudit();
    expect(pricedOn(report, "vision")[0]?.usd).toBeGreaterThan(pricedOn(report, "text_ocr")[0]?.usd ?? Infinity);
  });

  it("has no price for a path no document can take", () => {
    // The loader comparison read no pictures, so nothing was priced as images.
    expect(pricedOn(sampleReport(), "vision")).toEqual([]);
    expect(costRows(sampleReport()).every((row) => row.vision === null)).toBe(true);
  });

  it("is empty for a report without cost", () => {
    expect(pricedOn({ ...sampleAudit(), cost: null }, "text_ocr")).toEqual([]);
  });

  it("gives each provider its own colour and name", () => {
    const providers = providersOf(sampleAudit().cost?.models ?? []);
    const colours = providers.map(providerColour);
    expect(new Set(colours).size).toBe(providers.length);
    expect(providerName("openai")).toBe("OpenAI");
    expect(providerColour("someone-new")).toMatch(/^var\(--provider-[1-8]\)$/);
  });

  it("prices the folder as well as a thousand documents", () => {
    const report = sampleAudit();
    const [perThousand] = pricedOn(report, "text_ocr", "per_1000");
    const folder = pricedOn(report, "text_ocr", "folder").find((m) => m.id === perThousand?.id);
    // Six documents cost six thousandths of what a thousand do.
    expect(folder?.usd).toBeCloseTo((perThousand?.usd ?? 0) * 0.006, 6);
  });

  it("groups models by provider, each provider's cheapest first", () => {
    const models = byProvider(sampleAudit(), "text_ocr", "per_1000");
    const providers = models.map((m) => m.provider);
    // Each provider's models sit together.
    expect(providers.filter((p, i) => i === 0 || p !== providers[i - 1])).toEqual(providersOf(models));
    for (const provider of providersOf(models)) {
      const prices = models.filter((m) => m.provider === provider).map((m) => m.usd);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    }
    expect(byProvider(sampleAudit(), "text_ocr", "per_1000", "openai").every((m) => m.provider === "openai")).toBe(true);
  });
});
