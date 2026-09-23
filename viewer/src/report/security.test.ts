import { sampleAudit } from "@/test/sample";
import { evidenceCounts, findingRows, hiddenInstructions, severityByDocument } from "./security";

describe("security", () => {
  it("lists every identifier, most severe and best evidenced first", () => {
    const rows = findingRows(sampleAudit());
    expect(rows).toHaveLength(sampleAudit().aggregate.sensitive_total);
    expect(rows[0]).toMatchObject({ severity: "high", evidence: "confirmed" });
    expect(rows.at(-1)?.severity).toBe("low");
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
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
    expect(counts[0]?.label).toBe("checksum passed");
    expect(counts.reduce((sum, row) => sum + row.count, 0)).toBe(sampleAudit().aggregate.sensitive_total);
  });
});
