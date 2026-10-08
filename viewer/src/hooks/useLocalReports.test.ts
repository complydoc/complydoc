import { renderHook, waitFor } from "@testing-library/react";
import { sampleText } from "@/test/sample";
import { localConfig, notSavedHint, servedReadOnly, useLocalReports } from "./useLocalReports";

/** The element `complydoc ui` writes into the page it serves. */
function serveConfig(config: object) {
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "complydoc-local";
  script.textContent = JSON.stringify(config);
  document.head.append(script);
  return () => script.remove();
}

function respond(routes: Record<string, string>, status = 200) {
  return vi.fn(async (url: string) => {
    const body = routes[url];
    return body === undefined
      ? new Response("not found", { status: 404, statusText: "Not Found" })
      : new Response(body, { status });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("useLocalReports", () => {
  it("is off for a page opened any other way, and asks nothing of the network", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const addTexts = vi.fn();
    const { result } = renderHook(() => useLocalReports(addTexts));
    expect(result.current.status).toBe("off");
    expect(localConfig()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens every report complydoc ui found, by the names it gave them", async () => {
    const remove = serveConfig({ reports: "api/reports", sources: ["/work/.complydoc"] });
    vi.stubGlobal(
      "fetch",
      respond({
        "api/reports": JSON.stringify({
          reports: [
            { id: "a", name: "complydoc.json", url: "api/reports/a" },
            { id: "b", name: "contracts/complydoc.json", url: "api/reports/b" },
          ],
        }),
        "api/reports/a": sampleText,
        "api/reports/b": sampleText,
      }),
    );
    const addTexts = vi.fn();
    const { result } = renderHook(() => useLocalReports(addTexts));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(addTexts).toHaveBeenCalledWith([
      { name: "complydoc.json", text: sampleText, source: "api/reports/a" },
      { name: "contracts/complydoc.json", text: sampleText, source: "api/reports/b" },
    ]);
    expect(result.current.sources).toEqual(["/work/.complydoc"]);
    remove();
  });

  it("says so when the server cannot hand the reports over", async () => {
    const remove = serveConfig({ reports: "api/reports", sources: [] });
    vi.stubGlobal("fetch", respond({}));
    const { result } = renderHook(() => useLocalReports(vi.fn()));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.error).toContain("api/reports: 404");
    remove();
  });

  it("knows when complydoc ui serves it read-only, as it does for a team", () => {
    expect(servedReadOnly()).toBe(false);
    expect(notSavedHint()).toContain("complydoc ui to save it");

    let remove = serveConfig({ reports: "api/reports", sources: [] });
    expect(servedReadOnly()).toBe(false);
    remove();

    remove = serveConfig({ reports: "api/reports", sources: [], readOnly: true });
    expect(servedReadOnly()).toBe(true);
    expect(notSavedHint()).toContain("read-only");
    remove();
  });
});
