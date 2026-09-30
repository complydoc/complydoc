import { useCallback, useEffect, useState } from "react";
import type { CategoryRow, Report, Severity } from "@/report/types";

export interface CategoriesState {
  /** Whether the categories can be changed from here: served by `complydoc ui`, with the audited folder on this machine. */
  editable: boolean;
  file: string | null;
  /** Every category as the next run would look for it. Empty when the viewer cannot list them. */
  categories: CategoryRow[];
  error: string | null;
  change: (id: string, change: { enabled?: boolean; severity?: Severity }) => Promise<boolean>;
  reset: (id: string) => Promise<boolean>;
}

interface Listing {
  file: string;
  categories: CategoryRow[];
}

/**
 * The categories file beside the documents `report` audited, with every category as the
 * next run would look for it. With `source`, the report came from `complydoc ui`, which
 * reads and writes the file on this machine; without it, only what the run changed is known.
 */
export function useCategories(report: Report, source?: string): CategoriesState {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = source ? `${source}/categories` : null;

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

  return {
    editable: listing !== null,
    file: listing?.file ?? report.categories?.file ?? null,
    categories: listing?.categories ?? [],
    error,
    change: (id, change) => write("POST", { id, ...change }),
    reset: (id) => write("DELETE", { id }),
  };
}
