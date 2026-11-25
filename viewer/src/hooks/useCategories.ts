import { servedReadOnly } from "@/hooks/useLocalReports";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import type { CategoryRow, Report, Severity } from "@/report/types";

export interface CategoriesState {
  /** Whether the categories can be changed from here: served by `complydoc ui`, with the audited folder on this machine. */
  editable: boolean;
  /** Asked `complydoc ui` for the categories and not answered yet: nothing to show either way. */
  loading: boolean;
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
 * The last listing each folder's categories came back as, so coming back to Settings shows
 * them at once while they are asked for again.
 */
const seen = new Map<string, Listing | null>();

/**
 * The categories file beside the documents `report` audited, with every category as the
 * next run would look for it. With `source`, the report came from `complydoc ui`, which
 * reads and writes the file on this machine; without it, only what the run changed is known.
 */
export function useCategories(report: Report, source?: string): CategoriesState {
  const url = source ? `${source}/categories` : null;
  const [listing, setListing] = useState<Listing | null>(() => (url ? (seen.get(url) ?? null) : null));
  const [answered, setAnswered] = useState(() => url !== null && seen.has(url));
  const [error, setError] = useState<string | null>(null);
  const keep = useCallback(
    (next: Listing | null) => {
      if (url) seen.set(url, next);
      setListing(next);
      setAnswered(true);
    },
    [url],
  );

  useEffect(() => {
    if (!url) return;
    const abort = new AbortController();
    fetch(url, { signal: abort.signal })
      .then(async (response) => keep(response.ok ? ((await response.json()) as Listing) : null))
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) keep(seen.get(url) ?? null);
        return reason;
      });
    return () => abort.abort();
  }, [url, keep]);

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
        keep((await response.json()) as Listing);
        setError(null);
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "complydoc ui could not be reached.");
        return false;
      }
    },
    [url, keep],
  );

  return {
    editable: listing !== null && !servedReadOnly(),
    loading: url !== null && !answered,
    file: listing?.file ?? report.categories?.file ?? null,
    categories: listing?.categories ?? [],
    error,
    change: async (id, change) => {
      const done = await write("POST", { id, ...change });
      if (done) toast("Saved: the next run uses it");
      return done;
    },
    reset: async (id) => {
      const done = await write("DELETE", { id });
      if (done) toast("Put back as shipped");
      return done;
    },
  };
}
