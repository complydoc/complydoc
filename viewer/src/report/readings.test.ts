import { OCR_ID, costLabel, defaultPair, diffReadings, pageReadings } from "./readings";
import type { PageText } from "./types";

const page: PageText = {
  number: 1,
  source: "native",
  characters: 20,
  text: "Payment is due in thirty days",
  ocr_text: "Payment is due in 30 days",
  truncated: false,
  readings: { pdfplumber: "Payment is due in thirty days", pypdf: "is due Payment in thirty days" },
};

describe("pageReadings", () => {
  it("lists the kept reading first, the other readers, then OCR", () => {
    const readings = pageReadings(page, "pdfplumber");
    expect(readings.map((r) => [r.id, r.kept])).toEqual([
      ["pdfplumber", true],
      ["pypdf", false],
      [OCR_ID, false],
    ]);
  });

  it("leaves OCR out when it read nothing", () => {
    const readings = pageReadings({ ...page, ocr_text: "  " }, "pdfplumber");
    expect(readings.map((r) => r.id)).not.toContain(OCR_ID);
  });

  it("names a scanned page's kept reading OCR and drops its copies", () => {
    const scan: PageText = {
      ...page,
      source: "ocr",
      ocr_text: page.text,
      readings: { "rapidocr-onnxruntime": page.text },
    };
    expect(pageReadings(scan, "pdfplumber")).toEqual([
      { id: "pdfplumber", label: "OCR", text: page.text, kept: true },
    ]);
  });

  it("opens on the kept reading against the next one", () => {
    expect(defaultPair(pageReadings(page, "pdfplumber"))).toEqual(["pdfplumber", "pypdf"]);
    expect(defaultPair(pageReadings({ ...page, readings: {}, ocr_text: "" }, "pdfplumber"))).toEqual([
      "pdfplumber",
      "pdfplumber",
    ]);
  });
});

describe("diffReadings", () => {
  it("marks what each side has that the other lacks", () => {
    const diff = diffReadings("due in thirty days", "due in 30 days");
    expect(diff.left.filter((p) => p.changed).map((p) => p.text)).toEqual(["thirty"]);
    expect(diff.right.filter((p) => p.changed).map((p) => p.text)).toEqual(["30"]);
  });

  it("keeps each side's text whole", () => {
    const diff = diffReadings("a b c", "a x c");
    expect(diff.left.map((p) => p.text).join("")).toBe("a b c");
    expect(diff.right.map((p) => p.text).join("")).toBe("a x c");
  });

  it("counts the stretches that differ", () => {
    expect(diffReadings("same words", "same words").differences).toBe(0);
    expect(diffReadings("due in thirty days", "due in 30 days").differences).toBe(2);
  });
});

describe("reading costs", () => {
  const local = { usd: 0, basis: "local" as const, model: null, input_tokens: null, output_tokens: null };
  const vision = { usd: 0.0175, basis: "actual" as const, model: "claude-opus-5", input_tokens: 1500, output_tokens: 400 };

  it("carries each reader's cost, the kept one's included", () => {
    const priced: PageText = {
      ...page,
      readings: { ...page.readings, "vision:claude-opus-5": "Payment is due in thirty days" },
      kept: "pdfplumber",
      costs: { pdfplumber: local, pypdf: local, ocr: local, "vision:claude-opus-5": vision },
    };
    const readings = pageReadings(priced, "pdfplumber");
    expect(readings.map((r) => [r.id, costLabel(r.cost)])).toEqual([
      ["pdfplumber", "free · local"],
      ["pypdf", "free · local"],
      ["vision:claude-opus-5", "$0.0175"],
      [OCR_ID, "free · local"],
    ]);
  });

  it("names a page only a vision model read after that model", () => {
    const filled: PageText = { ...page, source: "vision", kept: "vision:claude-opus-5", costs: { "vision:claude-opus-5": vision } };
    const [kept] = pageReadings(filled, "pdfplumber");
    expect(kept).toMatchObject({ id: "vision:claude-opus-5", label: "vision:claude-opus-5", kept: true, cost: vision });
  });

  it("says an estimate is one, and a local reader is free rather than zero", () => {
    expect(costLabel({ ...vision, basis: "estimated", usd: 0.004 })).toBe("~$0.0040");
    expect(costLabel({ ...vision, basis: "unpriced", usd: null })).toBe("no price");
    expect(costLabel(local)).toBe("free · local");
    expect(costLabel(undefined)).toBeNull();
  });
});
