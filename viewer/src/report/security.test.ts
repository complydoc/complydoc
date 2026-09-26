import { sampleAudit } from "@/test/sample";
import { evidenceCounts, findingRows, hiddenInstructions, severityByDocument } from "./security";

describe("security", () => {
  it("lists every identifier, most severe and best evidenced first", () => {
    const rows = findingRows(sampleAudit());
    // A value found several times in one document is one row, counting each time.
    expect(rows.reduce((total, row) => total + row.count, 0)).toBe(sampleAudit().aggregate.sensitive_total);
    expect(rows.length).toBeLessThan(sampleAudit().aggregate.sensitive_total);
    expect(rows[0]).toMatchObject({ severity: "high", evidence: "confirmed" });
    expect(rows.at(-1)?.severity).toBe("low");
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it("makes a value repeated in one document one row, with every page it is on", () => {
    const repeated = findingRows(sampleAudit()).find((row) => row.count > 1);
    expect(repeated).toBeDefined();
    expect(repeated?.pages.length).toBeGreaterThan(0);
    const same = sampleAudit().documents[repeated?.document ?? 0]?.sensitive.matches.filter(
      (m) => m.label === repeated?.label && m.masked === repeated?.masked,
    );
    expect(same).toHaveLength(repeated?.count ?? 0);
  });

  it("keeps values masked", () => {
    expect(findingRows(sampleAudit()).every((row) => row.masked.includes("•"))).toBe(true);
  });

  it("counts each document's findings by severity, most first", () => {
    const [first, ...rest] = severityByDocument(sampleAudit());
    expect(first?.path).toBe("rechnungen-2026-de.pdf");
    expect(rest.every((row) => row.high + row.medium + row.low > 0)).toBe(true);
  });

  it("says where each hidden instruction is and why it was flagged", () => {
    const found = hiddenInstructions(sampleAudit());
    expect(found).toHaveLength(1);
    expect(found[0]?.reasons).toContain("addresses an AI model directly");
    expect(found[0]?.hiddenBy).toContain("white text");
  });

  it("counts findings by how strongly each is backed, strongest first", () => {
    const counts = evidenceCounts(sampleAudit());
    expect(counts[0]?.label).toBe("Certain");
    expect(counts.reduce((sum, row) => sum + row.count, 0)).toBe(sampleAudit().aggregate.sensitive_total);
  });
});
