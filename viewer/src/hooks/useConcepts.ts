import { useCallback, useEffect, useState } from "react";
import type { Concept, Report } from "@/report/types";

export interface ConceptsState {
  /** Whether the concepts can be changed from here: served by `complydoc ui`, with the audited folder on this machine. */
  editable: boolean;
  file: string | null;
  concepts: Concept[];
  error: string | null;
  save: (concept: Concept) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}

interface Listing {
  file: string;
  concepts: Concept[];
}

/**
 * The concepts file beside the documents `report` audited. With `source`, the
 * report came from `complydoc ui`, which reads and writes the file on this
 * machine; without it, the concepts are the ones the run looked for, read only.
 */
export function useConcepts(report: Report, source?: string): ConceptsState {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = source ? `${source}/concepts` : null;

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
    file: listing?.file ?? report.concepts?.file ?? null,
    concepts: listing?.concepts ?? report.concepts?.concepts ?? [],
    error,
    save: (concept) => write("POST", concept),
    remove: (id) => write("DELETE", { id }),
  };
}
