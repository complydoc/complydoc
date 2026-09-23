import { act, renderHook } from "@testing-library/react";
import { sampleText } from "@/test/sample";
import { embeddedReport, useReportFile } from "./useReportFile";

describe("useReportFile", () => {
  it("opens a report file", async () => {
    const { result } = renderHook(() => useReportFile());
    const file = new File([sampleText], "loaders.json", { type: "application/json" });
    await act(() => result.current.openFile(file));
    expect(result.current.state.status).toBe("ready");
  });

  it("explains a file that is not a report, and closes back to empty", () => {
    const { result } = renderHook(() => useReportFile());
    act(() => result.current.openText("notes.txt", "hello"));
    expect(result.current.state).toEqual({
      status: "error",
      name: "notes.txt",
      message: "This file is not JSON.",
    });
    act(() => result.current.close());
    expect(result.current.state).toEqual({ status: "empty" });
  });

  it("reads a report embedded in the page", () => {
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = "complydoc-report";
    script.textContent = sampleText;
    document.body.append(script);
    expect(embeddedReport().status).toBe("ready");
    script.remove();
    expect(embeddedReport().status).toBe("empty");
  });
});
