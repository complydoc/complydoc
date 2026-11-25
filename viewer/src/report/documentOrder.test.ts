import { required, sampleAudit } from "@/test/sample";
import type { Plan } from "./plan";
import { pricedModels } from "./pricing";
import { documentOrder, neighbours } from "./documentOrder";
import type { Report } from "./types";

const base = sampleAudit();
const models = pricedModels(base);
const plan: Plan = {
  method: "loader_ocr",
  loaders: {},
  text: required(models[0]),
  vision: required(models.find((m) => m.vision)),
};

function withPaths(paths: string[]): Report {
  return { ...base, documents: base.documents.map((d, i) => ({ ...d, relative_path: paths[i] ?? d.relative_path })) };
}

describe("documentOrder", () => {
  it("follows the list: folders first, then documents, each by name", () => {
    const report = withPaths(["b.pdf", "x/c.pdf", "a.pdf", "x/a.pdf", "d.pdf", "e.pdf"]);
    const names = documentOrder(report, plan).map((i) => report.documents[i]?.relative_path);
    expect(names).toEqual(["x/a.pdf", "x/c.pdf", "a.pdf", "b.pdf", "d.pdf", "e.pdf"]);
  });

  it("has nothing before the first or after the last", () => {
    const order = documentOrder(base, plan);
    const first = neighbours(base, plan, order[0] ?? 0);
    const last = neighbours(base, plan, order[order.length - 1] ?? 0);
    expect(first.previous).toBeNull();
    expect(first.position).toBe(1);
    expect(last.next).toBeNull();
    expect(last.position).toBe(base.documents.length);
  });
});
