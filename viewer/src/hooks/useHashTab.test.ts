import { act, renderHook, waitFor } from "@testing-library/react";
import { useHashTab } from "./useHashTab";

describe("useHashTab", () => {
  const tabs = ["summary", "documents"] as const;

  it("opens the first tab when the hash names none", () => {
    window.location.hash = "#nowhere";
    const { result } = renderHook(() => useHashTab(tabs));
    expect(result.current[0]).toBe("summary");
  });

  it("follows the hash both ways", async () => {
    const { result } = renderHook(() => useHashTab(tabs));
    act(() => result.current[1]("documents"));
    await waitFor(() => expect(result.current[0]).toBe("documents"));
    expect(window.location.hash).toBe("#documents");
  });
});
