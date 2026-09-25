import { act, renderHook } from "@testing-library/react";
import { sampleText } from "@/test/sample";
import { embeddedReports, useReports } from "./useReports";

describe("useReports", () => {
  it("opens several report files at once", async () => {
    const { result } = renderHook(() => useReports());
    const files = ["a.json", "b.json"].map((name) => new File([sampleText], name, { type: "application/json" }));
    await act(() => result.current.addFiles(files));
    expect(result.current.state.loaded.map((l) => l.name)).toEqual(["a.json", "b.json"]);
    expect(new Set(result.current.state.loaded.map((l) => l.id)).size).toBe(2);
  });

  it("explains a file that is not a report, keeps the ones that are, and closes back to empty", () => {
    const { result } = renderHook(() => useReports());
    act(() =>
      result.current.addTexts([
        { name: "notes.txt", text: "hello" },
        { name: "loaders.json", text: sampleText },
      ]),
    );
    expect(result.current.state.errors).toEqual(["notes.txt: This file is not JSON."]);
    expect(result.current.state.loaded).toHaveLength(1);
    act(() => result.current.closeAll());
    expect(result.current.state).toEqual({ loaded: [], errors: [] });
  });

  it("reads a report embedded in the page", () => {
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = "complydoc-report";
    script.textContent = sampleText;
    document.body.append(script);
    expect(embeddedReports().loaded).toHaveLength(1);
    script.remove();
    expect(embeddedReports().loaded).toHaveLength(0);
  });
});
