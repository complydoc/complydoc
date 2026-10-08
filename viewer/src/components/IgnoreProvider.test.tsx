import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useIgnores } from "@/hooks/useIgnores";
import { sampleAudit } from "@/test/sample";
import { IgnoreProvider } from "./IgnoreProvider";

const SOURCE = "api/reports/a";
const ON_FILE = { finding: "sha256:aaaa", reason: "Our own account." };

/** The element `complydoc ui` writes into the page it serves. */
function serveConfig(config: object) {
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "complydoc-local";
  script.textContent = JSON.stringify(config);
  document.head.append(script);
  return () => script.remove();
}

function listing() {
  return new Response(JSON.stringify({ file: "/work/.complydoc-ignore.yaml", ignores: [ON_FILE] }));
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <IgnoreProvider report={sampleAudit()} source={SOURCE}>
    {children}
  </IgnoreProvider>
);

afterEach(() => vi.unstubAllGlobals());

describe("IgnoreProvider", () => {
  it("writes the ignore file through complydoc ui", async () => {
    const remove = serveConfig({ reports: "api/reports", sources: [] });
    const fetch = vi.fn(async () => listing());
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useIgnores(), { wrapper });
    await waitFor(() => expect(result.current.editable).toBe(true));

    await act(async () => void (await result.current.ignore({ finding: "sha256:bbbb", reason: "A sample." })));
    expect(fetch).toHaveBeenCalledWith(`${SOURCE}/ignores`, expect.objectContaining({ method: "POST" }));
    remove();
  });

  it("read-only, shows what is on file and keeps a new ignore in the page, asking nothing of the server", async () => {
    const remove = serveConfig({ reports: "api/reports", sources: [], readOnly: true });
    const fetch = vi.fn(async () => listing());
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useIgnores(), { wrapper });
    await waitFor(() => expect(result.current.entries).toEqual([ON_FILE]));
    expect(result.current.editable).toBe(false);

    await act(async () => void (await result.current.ignore({ finding: "sha256:bbbb", reason: "A sample." })));
    expect(result.current.entries.map((entry) => entry.finding)).toEqual(["sha256:aaaa", "sha256:bbbb"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    remove();
  });
});
