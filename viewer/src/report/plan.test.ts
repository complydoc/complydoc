import { pricedModels } from "./pricing";
import { defaultMethod, loaderChoices, planOptions, type Plan } from "./plan";
import { pageEstimate } from "./planEstimate";
import { required, sampleAudit } from "@/test/sample";
import type { DocumentEntry, PageText, Report } from "./types";

const report = sampleAudit();
const models = pricedModels(report);
const plan: Plan = {
  method: "loader",
  loaders: {},
  text: required(models[0]),
  vision: required(models.find((m) => m.vision)),
};
const pdf = required(report.documents[0], "a document");
const page = required(pdf.extracted_text[0], "a page");

/** The sample's first page as a spreadsheet sheet: its own text, read by openpyxl, and nothing to draw. */
function sheet(): { report: Report; document: DocumentEntry; page: PageText } {
  const text = { ...page.tokens?.pdfplumber };
  const sheetPage: PageText = {
    ...page,
    kept: "openpyxl",
    readings: { openpyxl: page.text },
    tokens: { openpyxl: text },
    seconds: { openpyxl: 0.01 },
    // A run estimates a picture's tokens for every page, drawn or not.
  };
  const document: DocumentEntry = {
    ...pdf,
    format: "xlsx",
    extracted_text: [sheetPage],
    // Routing sends a sheet with merged header cells to vision, which cannot be shown it.
    routing: { pages: [{ number: sheetPage.number, route: "vision", reason: "merged header cells" }] },
  };
  return { report: { ...report, documents: [...report.documents, document] }, document, page: sheetPage };
}

/** The sample's first page as a scan: no text of its own, read by OCR. */
function scan(): { report: Report; page: PageText } {
  const scanned: PageText = { ...page, source: "ocr", kept: "ocr", readings: {} };
  const document: DocumentEntry = { ...pdf, extracted_text: [scanned] };
  return { report: { ...report, documents: [document] }, page: scanned };
}

describe("reading plans", () => {
  it("recommends the complydoc router where the run routed pages", () => {
    const options = planOptions(report);
    expect(options.map((o) => o.id)).toContain("router");
    expect(defaultMethod(options)).toBe("router");
  });

  it("offers the loader for each file type the run read more than one way", () => {
    expect(loaderChoices(report)).toEqual([{ format: "pdf", label: "PDF", readers: ["pdfplumber", "pypdf"] }]);
    const { report: mixed } = sheet();
    expect(loaderChoices(mixed).map((c) => c.format)).toEqual(["pdf"]);
    expect(planOptions(mixed)[0]?.description).toContain("openpyxl for Excel");
  });

  it("reads a spreadsheet with its loader under vision and OCR", () => {
    const { report: mixed, document, page: sheetPage } = sheet();
    for (const method of ["vision", "ocr", "router"] as const) {
      const estimate = pageEstimate(mixed, document, sheetPage, { ...plan, method });
      expect(estimate.read).toBe(true);
      expect(estimate.seconds).toBe(0.01);
    }
  });

  it("leaves a scan unread when only the loader reads, and OCRs it otherwise", () => {
    const { report: scanned, page: scannedPage } = scan();
    const document = required(scanned.documents[0]);
    expect(pageEstimate(scanned, document, scannedPage, plan)).toMatchObject({ read: false, usd: 0 });
    expect(pageEstimate(scanned, document, scannedPage, { ...plan, method: "loader_ocr" }).read).toBe(true);
    expect(planOptions(scanned).map((o) => o.id)).toContain("loader_ocr");
  });

  it("prices a page on the loader chosen for its file type", () => {
    const kept = pageEstimate(report, pdf, page, plan);
    const pypdf = pageEstimate(report, pdf, page, { ...plan, loaders: { pdf: "pypdf" } });
    expect(kept.seconds).toBe(page.seconds?.pdfplumber);
    expect(pypdf.seconds).toBe(page.seconds?.pypdf);
  });

  it("does not offer vision where no page can be shown to a vision model", () => {
    expect(planOptions(report).map((o) => o.id)).toContain("vision");
    const unpictured: Report = {
      ...report,
      documents: report.documents.map((d) => ({
        ...d,
        extracted_text: d.extracted_text.map((p) => ({ ...p, image_tokens: {} })),
      })),
    };
    expect(planOptions(unpictured).map((o) => o.id)).not.toContain("vision");
  });
});
