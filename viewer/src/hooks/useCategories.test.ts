import { renderHook, waitFor } from "@testing-library/react";
import { sampleAudit } from "@/test/sample";
import { useCategories } from "./useCategories";

describe("useCategories", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is loading until complydoc ui answers, and shows the last answer at once when opened again", async () => {
    const listing = { file: "/work/.complydoc-categories.yaml", categories: [] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(listing))));
    const report = sampleAudit();
    const first = renderHook(() => useCategories(report, "/runs/cache-test"));
    expect(first.result.current.loading).toBe(true);
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const again = renderHook(() => useCategories(report, "/runs/cache-test"));
    expect(again.result.current.loading).toBe(false);
    expect(again.result.current.file).toBe(listing.file);
  });
});
