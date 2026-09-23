import { fileName, formatPercent, formatUsd, formatScore, formatSeconds, humanise, plural } from "./format";

describe("format", () => {
  it("rounds a score and dashes a missing one", () => {
    expect(formatScore(92.7)).toBe("93");
    expect(formatScore(null)).toBe("–");
  });

  it("picks a unit that suits the duration", () => {
    expect(formatSeconds(0.077)).toBe("77 ms");
    expect(formatSeconds(7.337)).toBe("7.3 s");
    expect(formatSeconds(180)).toBe("3 min");
  });

  it("writes a fraction as a percentage", () => {
    expect(formatPercent(0.8467)).toBe("85%");
  });

  it("pluralises by count", () => {
    expect(plural(1, "document")).toBe("1 document");
    expect(plural(1200, "document")).toBe("1,200 documents");
  });

  it("keeps the last part of a path, either separator", () => {
    expect(fileName("src/complydoc/sample/invoice-de.pdf")).toBe("invoice-de.pdf");
    expect(fileName("C:\\reports\\a.pdf")).toBe("a.pdf");
  });

  it("turns a key into words", () => {
    expect(humanise("email_address")).toBe("Email address");
  });

  it("writes dollars to the cent, or finer under a cent", () => {
    expect(formatUsd(8)).toBe("$8.00");
    expect(formatUsd(0.6180000001)).toBe("$0.62");
    expect(formatUsd(0.00559)).toBe("$0.0056");
    expect(formatUsd(null)).toBe("–");
  });
});
