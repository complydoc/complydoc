import { required, sampleAudit } from "@/test/sample";
import { findAll, findingHighlight, segments } from "./highlight";

describe("highlight", () => {
  it("finds a value across spacing the reader changed", () => {
    expect(findAll("IBAN: •••• ••54\n32 end", "•••• ••54 32")).toEqual([[6, 18]]);
    expect(findAll("nothing here", "••54")).toEqual([]);
  });

  it("marks a value that spans several diff parts", () => {
    const parts = [
      { text: "IBAN: ", changed: false },
      { text: "•••• ••54", changed: true },
      { text: " 32 end", changed: false },
    ];
    const marked = segments(parts, "•••• ••54 32")
      .filter((s) => s.highlighted)
      .map((s) => s.text)
      .join("");
    expect(marked).toBe("•••• ••54 32");
    expect(segments(parts, "•••• ••54 32").map((s) => s.text).join("")).toBe("IBAN: •••• ••54 32 end");
  });

  it("leaves the parts alone with nothing to mark", () => {
    const parts = [{ text: "a b", changed: false }];
    expect(segments(parts, null)).toEqual([{ text: "a b", changed: false, highlighted: false }]);
  });

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
