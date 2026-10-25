import { explainPage, summarise } from "./diffExplain";

const CLAUSE = "Invoices are payable within fourteen days of the invoice date. Late payment carries interest.";

describe("explainPage", () => {
  it("says nothing of two readings that are the same but for spacing", () => {
    expect(explainPage(1, CLAUSE, CLAUSE.replace(/ /g, "\n  "))).toBeNull();
  });

  it("calls the same words broken differently spacing only", () => {
    expect(explainPage(1, "Pay-\nment is due.", "Payment is due")?.kinds).toEqual(["spacing"]);
  });

  it("pairs a number read two ways and leaves an unrelated one as missing", () => {
    const page = explainPage(1, "Total due 78,500.00 VAT 4.250,00", "Total due 78,5OO.OO VAT");
    expect(page?.numbers).toEqual([["78,500.00", "78,5OO.OO"]]);
    expect(page?.kinds).toEqual(["numbers", "missing"]);
    expect(page?.missing).toBe(1);
  });

  it("sees a character or two wrong as a misread, not as missing text", () => {
    const page = explainPage(1, CLAUSE, CLAUSE.replace("payable", "payab1e").replace("interest", "lnterest"));
    expect(page?.kinds).toEqual(["characters"]);
    expect(page?.misread).toEqual([
      ["payable", "payab1e"],
      ["interest", "lnterest"],
    ]);
  });

  it("sees words run together, or pulled apart, as such and not as missing text", () => {
    const together = explainPage(1, "Der Wartungsvertrag zwischen der Firma endet.", "DerWartungsvertragzwischen der Firma endet.");
    expect(together?.kinds).toEqual(["joined"]);
    expect(together?.joined).toEqual([["Der Wartungsvertrag zwischen", "DerWartungsvertragzwischen"]]);
    const masked = explainPage(1, "Der Vertrag zwischen der •••••• endet.", "DerVertragzwischenMuller endet.");
    expect(masked?.joined).toEqual([["Der Vertrag zwischen", "DerVertragzwischenMuller"]]);
    const apart = explainPage(1, "Invoice total includes VAT", "Invoice to tal includes VAT");
    expect(apart?.joined).toEqual([["total", "to tal"]]);
  });

  it("sees two columns read across as reading order", () => {
    const left = "alpha bravo charlie delta echo foxtrot golf hotel";
    const right = "india juliet kilo lima mike november oscar papa";
    const page = explainPage(1, `${left} ${right}`, `${right} ${left}`);
    expect(page?.kinds).toEqual(["order"]);
    expect(page?.moved).toBe(8);
  });

  it("does not call a repeated sentence read once less a change of order", () => {
    const sentence = "The board met four times in the year.";
    const page = explainPage(1, `${sentence} Revenue grew. ${sentence} Costs fell. ${sentence}`, `Revenue grew. ${sentence} Costs fell. ${sentence}`);
    expect(page?.kinds).toEqual(["missing"]);
  });

  it("counts words read into a run too poorly to match one by one as run together", () => {
    const page = explainPage(1, "Cyber security remains a principal risk for the board.", "Cyber securityremains apricipalrisk for the board.");
    // "principal" is read wrong inside the run, so it alone is missing.
    expect(page?.kinds).toEqual(["missing", "joined"]);
    expect([page?.missing, page?.added, page?.runWords]).toEqual([1, 0, 4]);
  });

  it("counts what one reading left out and the other added", () => {
    const page = explainPage(1, `${CLAUSE} Title passes on payment in full.`, `${CLAUSE} Page 3 of 9`);
    expect(page?.kinds).toEqual(["missing", "added"]);
    expect([page?.missing, page?.added]).toEqual([6, 4]);
  });
});

describe("summarise", () => {
  it("lists each kind with its pages, worst first", () => {
    const pages = [
      explainPage(1, "Total 78,500.00", "Total 78,5OO.OO"),
      explainPage(2, "a b", "a\nb x"),
      explainPage(3, "Total 1,200.00 due", "Total 1,2OO.OO"),
      explainPage(4, "Total 78,500.00", "Total 78,5OO.OO"),
    ].filter((page) => page !== null);
    expect(summarise(pages)).toEqual([
      {
        kind: "numbers",
        pages: [1, 3, 4],
        count: 3,
        examples: [
          ["78,500.00", "78,5OO.OO"],
          ["1,200.00", "1,2OO.OO"],
        ],
      },
      { kind: "missing", pages: [3], count: 1, examples: [] },
      { kind: "added", pages: [2], count: 1, examples: [] },
    ]);
  });
});
