/**
 * The time axis over a trace's waterfall: marks at round values, so a bar's length can be
 * read off it, and a step's place in the run found at a glance.
 */

/** Steps between marks, in seconds, from a millisecond to an hour. */
const STEPS = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 15, 30, 60, 120, 300, 600, 1800,
  3600,
];

/** The marks for a run `total` seconds long: from 0, a round step apart, at most `most` of them. */
export function ticks(total: number, most = 6): number[] {
  if (!(total > 0)) return [0];
  const step = STEPS.find((s) => total / s <= most - 1) ?? STEPS[STEPS.length - 1] ?? total;
  const marks: number[] = [];
  for (let at = 0; at <= total + step * 1e-9; at += step) marks.push(Number(at.toFixed(6)));
  return marks;
}

/** A mark as the axis writes it: "0", "250ms", "1.5s", "2m". */
export function tickLabel(seconds: number): string {
  if (seconds === 0) return "0";
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${Number(seconds.toFixed(2))}s`;
  return `${Number((seconds / 60).toFixed(1))}m`;
}
