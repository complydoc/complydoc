import { fingerprinted } from "@/test/fingerprinted";
import { required, sampleAudit } from "@/test/sample";
import { contextOf, nextUnreviewed, progressOf, readKept, reviewId, writeKept } from "./review";
import { findingRows } from "./security";

const report = fingerprinted(sampleAudit());
const rows = findingRows(report);

describe("review", () => {
  it("finds each finding in the page's masked text, at its place", () => {
    const row = required(rows.find((candidate) => contextOf(report, candidate) !== null));
    // Masking keeps a value's length, so the place found is the masked value itself.
    expect(contextOf(report, row)?.line.hit).toBe(row.masked);
  });

  it("counts what was kept and what was ignored, ignoring winning", () => {
    const [first, second] = rows;
    const ignored = required(second).source.fingerprint;
    const kept = new Set([reviewId(required(first)), reviewId(required(second))]);
    expect(progressOf(rows, kept, (f) => f === ignored)).toMatchObject({
      total: rows.length,
      kept: 1,
      ignored: 1,
      reviewed: 2,
    });
  });

  it("keeps a finding from a report written before fingerprints by where and what it is", () => {
    const older = findingRows(sampleAudit());
    const row = required(older[0]);
    expect(row.source.fingerprint).toBeUndefined();
    expect(progressOf(older, new Set([reviewId(row)]), () => false).kept).toBe(1);
  });

  it("skips to the next finding not yet reviewed, going round", () => {
    const upTo = (index: number) => (row: (typeof rows)[number]) => rows.indexOf(row) <= index;
    expect(nextUnreviewed(rows, 0, upTo(2))).toBe(3);
    expect(nextUnreviewed(rows, rows.length - 1, () => false)).toBe(0);
    expect(nextUnreviewed(rows, 0, () => true)).toBeNull();
  });

  it("remembers what was kept in this browser", () => {
    writeKept("complydoc-reviewed:test", new Set(["id-b", "id-a"]));
    expect([...readKept("complydoc-reviewed:test")]).toEqual(["id-a", "id-b"]);
    localStorage.setItem("complydoc-reviewed:broken", "{not json");
    expect(readKept("complydoc-reviewed:broken").size).toBe(0);
  });
});
