import { checkFor, factsToShow, outcome, scoreboard } from "./evals";
import type { EvalSummary } from "./types";

const EVALS: EvalSummary = {
  file: "/work/contracts/.complydoc-evals.yaml",
  readers: ["drops", "whole"],
  checks: [
    { fact: "Invoices are payable within fourteen days", found: { whole: "exact", drops: "exact" }, scores: {} },
    {
      fact: "Title passes on receipt of payment",
      document: "terms.pdf",
      found: { whole: "exact", drops: "fuzzy" },
      scores: {},
      nearest: { drops: "Title passes full and not before" },
    },
    { fact: "The supplier indemnifies the customer", found: { whole: null, drops: null }, scores: {} },
  ],
};

describe("evals", () => {
  it("counts a fact as kept only when it was read as written", () => {
    const [second, clause] = [EVALS.checks[1], EVALS.checks[2]];
    expect(second && outcome(second, "whole")).toBe("kept");
    expect(second && outcome(second, "drops")).toBe("near");
    expect(clause && outcome(clause, "whole")).toBe("lost");
  });

  it("ranks the readings by facts kept", () => {
    expect(scoreboard(EVALS)).toEqual([
      { reader: "whole", kept: 2, near: 0, lost: 1, total: 3 },
      { reader: "drops", kept: 1, near: 1, lost: 1, total: 3 },
    ]);
  });

  it("finds the run's check of a fact whatever its case, and none for one added since", () => {
    expect(checkFor(EVALS, { text: "title passes on receipt of payment", document: "terms.pdf" })?.nearest?.drops).toBe(
      "Title passes full and not before",
    );
    expect(checkFor(EVALS, { text: "Title passes on receipt of payment" })).toBeUndefined();
    expect(checkFor(null, { text: "anything" })).toBeUndefined();
  });

  it("shows the file's facts where it can be read, else the ones the run checked", () => {
    expect(factsToShow([{ text: "New" }], EVALS)).toEqual([{ text: "New" }]);
    expect(factsToShow(null, EVALS).map((fact) => fact.text)).toHaveLength(3);
    expect(factsToShow(null, null)).toEqual([]);
  });
});
