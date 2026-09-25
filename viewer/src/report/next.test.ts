import { sampleAudit, sampleVerified } from "@/test/sample";
import { nextSteps } from "./next";

describe("nextSteps", () => {
  it("suggests a vision check only for a run that made none", () => {
    expect(nextSteps(sampleAudit()).map((s) => s.id)).toContain("verify");
    expect(nextSteps(sampleVerified()).map((s) => s.id)).not.toContain("verify");
  });

  it("suggests timing OCR on every page only where the run did not", () => {
    const report = sampleAudit();
    expect(nextSteps(report).map((s) => s.id)).not.toContain("ocr");
    const without = { ...report, run: { ...report.run, ocr_compare_used: false } };
    expect(nextSteps(without).find((s) => s.id === "ocr")?.command).toBe(`complydoc audit ${report.run.target} --ocr-compare`);
  });

  it("quotes a folder whose path holds a space", () => {
    const report = sampleAudit();
    const spaced = { ...report, run: { ...report.run, target: "/Users/me/My Contracts" } };
    expect(nextSteps(spaced).find((s) => s.id === "readers")?.command).toBe(
      "complydoc compare-readers '/Users/me/My Contracts'",
    );
  });
});
