import { tickLabel, ticks } from "./timeAxis";

describe("ticks", () => {
  it("marks a run at round steps from nought, no more than asked for", () => {
    expect(ticks(2.9)).toEqual([0, 1, 2]);
    expect(ticks(0.12)).toEqual([0, 0.05, 0.1]);
    expect(ticks(45)).toEqual([0, 10, 20, 30, 40]);
    expect(ticks(9.8)).toEqual([0, 2, 4, 6, 8]);
    expect(ticks(10).length).toBeLessThanOrEqual(6);
  });

  it("gives a run with no length a single mark", () => {
    expect(ticks(0)).toEqual([0]);
  });
});

describe("tickLabel", () => {
  it("writes a mark in the unit that reads shortest", () => {
    expect([0, 0.25, 1.5, 120].map(tickLabel)).toEqual(["0", "250ms", "1.5s", "2m"]);
  });
});
