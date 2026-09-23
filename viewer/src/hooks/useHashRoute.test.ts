import { act, renderHook, waitFor } from "@testing-library/react";
import { useHashRoute } from "./useHashRoute";

const pages = ["summary", "documents"] as const;

describe("useHashRoute", () => {
  it("opens the first page when the hash names none", () => {
    window.location.hash = "#nowhere/2";
    const { result } = renderHook(() => useHashRoute(pages));
    expect(result.current[0]).toEqual({ page: "summary", detail: null });
  });

  it("reads a page and what is open inside it", () => {
    window.location.hash = "#documents/3";
    const { result } = renderHook(() => useHashRoute(pages));
    expect(result.current[0]).toEqual({ page: "documents", detail: "3" });
  });

  it("writes where it goes back to the hash", async () => {
    const { result } = renderHook(() => useHashRoute(pages));
    act(() => result.current[1]("documents", "4"));
    await waitFor(() => expect(result.current[0]).toEqual({ page: "documents", detail: "4" }));
    act(() => result.current[1]("summary"));
    await waitFor(() => expect(window.location.hash).toBe("#summary"));
  });
});
