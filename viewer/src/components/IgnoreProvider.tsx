import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { IgnoreContext, type IgnoreRequest, type IgnoreState } from "@/hooks/useIgnores";
import type { IgnoreRule, Report } from "@/report/types";

interface Listing {
  file: string;
  ignores: IgnoreRule[];
}

/**
 * The ignore file of the folder `report` audited.
 *
 * With `source`, the report came from `complydoc ui`, which reads and writes the
 * file on this machine; the viewer asks nothing of any other server. Without
 * it, the entries are the ones the run read, and cannot be changed from here.
 */
export function IgnoreProvider({ report, source, children }: { report: Report; source?: string; children: ReactNode }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = source ? `${source}/ignores` : null;

  useEffect(() => {
    if (!url) return;
    const abort = new AbortController();
    fetch(url, { signal: abort.signal })
      .then(async (response) => (response.ok ? setListing((await response.json()) as Listing) : setListing(null)))
      .catch(() => undefined);
    return () => abort.abort();
  }, [url]);

  const write = useCallback(
    async (method: "POST" | "DELETE", body: object) => {
      if (!url) return false;
      try {
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          setError(await response.text());
          return false;
        }
        setListing((await response.json()) as Listing);
        setError(null);
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "complydoc ui could not be reached.");
        return false;
      }
    },
    [url],
  );

  const state = useMemo<IgnoreState>(
    () => ({
      editable: listing !== null,
      file: listing?.file ?? report.ignores?.file ?? null,
      entries: listing?.ignores ?? report.ignores?.rules ?? [],
      error,
      ignore: (request: IgnoreRequest) => write("POST", request),
      unignore: (finding: string) => write("DELETE", { finding }),
    }),
    [listing, report.ignores, error, write],
  );

  return <IgnoreContext.Provider value={state}>{children}</IgnoreContext.Provider>;
}
