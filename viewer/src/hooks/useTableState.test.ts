import { act, renderHook } from "@testing-library/react";
import { useTableState } from "./useTableState";

describe("useTableState", () => {
  beforeEach(() => {
    window.location.hash = "#pipeline";
  });

  it("gives the same sort from one render to the next while the address says the same", () => {
    // A new list each render reads to the table as a new sort: it resets its page, which
    // renders it again, without end. That froze the Traces page once a run was opened.
    const { result, rerender } = renderHook(() => useTableState("runs"));
    const first = result.current.sorting;
    rerender();
    expect(result.current.sorting).toBe(first);
    // Something else in the address changing, as opening a run does, leaves it be too.
    act(() => {
      window.history.replaceState(null, "", "#pipeline?trace=open");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.sorting).toBe(first);
  });

  it("reads and writes the sort and the search in the address", () => {
    const { result } = renderHook(() => useTableState("runs"));
    act(() => result.current.setSorting([{ id: "seconds", desc: true }]));
    expect(window.location.hash).toContain("runs.sort=seconds%3Adesc");
    expect(result.current.sorting).toEqual([{ id: "seconds", desc: true }]);
    act(() => result.current.setQuery("sept"));
    expect(window.location.hash).toContain("runs.q=sept");
    expect(result.current.query).toBe("sept");
  });

  it("keeps them to itself without a name", () => {
    const { result } = renderHook(() => useTableState());
    act(() => result.current.setQuery("x"));
    expect(result.current.query).toBe("x");
    expect(window.location.hash).toBe("#pipeline");
  });
});
