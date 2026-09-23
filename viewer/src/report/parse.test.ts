import { sampleText } from "../test/sample";
import { ReportError, parseReport } from "./parse";

describe("parseReport", () => {
  it("reads a report complydoc wrote", () => {
    const report = parseReport(sampleText);
    expect(report.run.schema_version).toBe(15);
    expect(report.documents).toHaveLength(6);
    expect(report.loader_comparison?.recommended).toBe("pypdf");
  });

  it("says when the file is not JSON", () => {
    expect(() => parseReport("not json")).toThrow(new ReportError("This file is not JSON."));
  });

  it("says when the JSON is not a report", () => {
    expect(() => parseReport('{"name": "package"}')).toThrow("not a complydoc report");
  });

  it("names the schema it cannot read", () => {
    const old = JSON.stringify({ run: { schema_version: 8 }, overall: {}, documents: [] });
    expect(() => parseReport(old)).toThrow("uses schema 8");
  });

  it("gives a single-loader report an empty comparison", () => {
    const single = JSON.stringify({ run: { schema_version: 15 }, overall: {}, documents: [] });
    expect(parseReport(single).loader_comparison).toBeNull();
  });
});
