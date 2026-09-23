import { documentHref, parseTarget } from "./route";

describe("route", () => {
  it("reads a document, a page and a finding", () => {
    expect(parseTarget("3")).toEqual({ document: 3, page: null, finding: null });
    expect(parseTarget("3/2")).toEqual({ document: 3, page: 2, finding: null });
    expect(parseTarget("3/2/i5")).toEqual({ document: 3, page: 2, finding: { kind: "identifier", index: 5 } });
    expect(parseTarget("0/1/h0")?.finding).toEqual({ kind: "hidden", index: 0 });
  });

  it("refuses what is not a document", () => {
    expect(parseTarget("")).toBeNull();
    expect(parseTarget("abc")).toBeNull();
    expect(parseTarget("3/x/i2")).toEqual({ document: 3, page: null, finding: { kind: "identifier", index: 2 } });
  });

  it("writes the same shape back", () => {
    expect(documentHref(3)).toBe("#documents/3");
    expect(documentHref(3, 2)).toBe("#documents/3/2");
    expect(documentHref(3, 2, { kind: "identifier", index: 5 })).toBe("#documents/3/2/i5");
    expect(parseTarget(documentHref(1, 4, { kind: "hidden", index: 0 }).slice("#documents/".length))).toEqual({
      document: 1,
      page: 4,
      finding: { kind: "hidden", index: 0 },
    });
  });
});
