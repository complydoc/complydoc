import { pricedModels } from "./pricing";
import { reportTotals, type Plan } from "./plan";
import { documentTree, type TreeNode } from "./tree";
import { required, sampleAudit } from "@/test/sample";
import type { Report } from "./types";

function withPaths(report: Report, paths: string[]): Report {
  return { ...report, documents: report.documents.map((d, i) => ({ ...d, relative_path: paths[i] ?? d.relative_path })) };
}

const report = sampleAudit();
const models = pricedModels(report);
const plan: Plan = { reader: "kept", text: required(models[0]), vision: required(models.find((m) => m.vision)) };

describe("documentTree", () => {
  const paths = ["contracts/2025/a.pdf", "contracts/2025/b.pdf", "contracts/2024/c.pdf", "invoices/d.pdf", "e.pdf", "f.pdf"];
  const tree = documentTree(withPaths(report, paths), plan);

  it("puts folders first, each holding its documents", () => {
    expect(tree.map((n) => n.name)).toEqual(["contracts", "invoices", "e.pdf", "f.pdf"]);
    const contracts = required(tree[0]);
    expect(contracts.children?.map((n) => n.name)).toEqual(["2024", "2025"]);
  });

  it("adds up a folder's documents", () => {
    const contracts = required(tree[0]);
    const files = (node: TreeNode): TreeNode[] => (node.kind === "file" ? [node] : (node.children ?? []).flatMap(files));
    const leaves = files(contracts);
    expect(contracts.totals.documents).toBe(3);
    expect(contracts.totals.pages).toBe(leaves.reduce((sum, n) => sum + n.totals.pages, 0));
    expect(contracts.totals.usd).toBeCloseTo(leaves.reduce((sum, n) => sum + (n.totals.usd ?? 0), 0));
  });

  it("shows a folder that holds only one folder as one row", () => {
    const nested = documentTree(withPaths(report, paths.map((p) => `clients/acme/${p}`)), plan);
    expect(nested.map((n) => n.name)).toEqual(["clients/acme"]);
  });
});

describe("plans", () => {
  it("reads every page with OCR or vision, and some pages with the text layer alone", () => {
    const kept = reportTotals(report, plan);
    const vision = reportTotals(report, { ...plan, reader: "vision" });
    expect(kept.pagesRead).toBe(kept.pages);
    expect(vision.usd).toBeGreaterThan(kept.usd ?? 0);
  });

  it("times what was measured, and leaves a vision read untimed until a real call was", () => {
    const kept = reportTotals(report, plan);
    const vision = reportTotals(report, { ...plan, reader: "vision" });
    expect(kept.seconds).toBeGreaterThan(0);
    expect(vision.seconds).toBeNull();
    expect(vision.untimed).toBe(vision.pages);
  });
});
