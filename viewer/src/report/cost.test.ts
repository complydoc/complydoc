import { sampleAudit, sampleReport } from "@/test/sample";
import { cheapest, costRows, pricedOn } from "./cost";

describe("cost", () => {
  it("lists the priced models on a path, cheapest first", () => {
    const priced = pricedOn(sampleAudit(), "text_ocr");
    expect(priced.length).toBeGreaterThan(1);
    expect(priced.map((m) => m.usd)).toEqual([...priced.map((m) => m.usd)].sort((a, b) => a - b));
  });

  it("finds images dearer than text", () => {
    const report = sampleAudit();
    expect(cheapest(report, "vision")?.usd).toBeGreaterThan(cheapest(report, "text_ocr")?.usd ?? Infinity);
  });

  it("has no price for a path no document can take", () => {
    // The loader comparison read no pictures, so nothing was priced as images.
    expect(cheapest(sampleReport(), "vision")).toBeNull();
    expect(costRows(sampleReport()).every((row) => row.vision === null)).toBe(true);
  });

  it("is empty for a report without cost", () => {
    expect(pricedOn({ ...sampleAudit(), cost: null }, "text_ocr")).toEqual([]);
  });
});
