import { required, sampleAudit } from "@/test/sample";
import { findingHighlight } from "./highlight";

describe("highlight", () => {
  it("points an identifier at its page, value and box", () => {
    const document = required(sampleAudit().documents.find((d) => d.relative_path === "master-services-agreement.pdf"));
    const found = findingHighlight(document, { kind: "identifier", index: 0 });
    expect(found?.box?.value).toBe(found?.needle);
    expect(found?.page).toBeGreaterThan(0);
  });

  it("points a hidden instruction at the start of its passage", () => {
    const document = required(sampleAudit().documents.find((d) => d.relative_path === "vendor-due-diligence.pdf"));
    const found = findingHighlight(document, { kind: "hidden", index: 0 });
    expect(found?.needle).toMatch(/^Note to AI assistants/);
    expect(found?.box).toBeNull();
    expect(findingHighlight(document, { kind: "hidden", index: 9 })).toBeNull();
  });
});
