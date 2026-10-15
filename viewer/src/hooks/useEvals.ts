import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { servedReadOnly } from "@/hooks/useLocalReports";
import { toast } from "@/lib/toast";
import type { ExpectedFact } from "@/report/evals";
import type { EvalSummary } from "@/report/types";

export interface EvalsState {
  /** Whether facts can be added here: served by `complydoc ui`, with the folder on this machine. */
  editable: boolean;
  file: string | null;
  /** What the file holds now; null when it cannot be read from here. */
  facts: ExpectedFact[] | null;
  error: string | null;
  /**
   * The file's facts checked against the text this run kept, as of the last time they were
   * run; null before the first, and where there is no `complydoc ui` to run them.
   */
  scored: EvalSummary | null;
  running: boolean;
  /** Check the facts as they are now. Nothing is read again: the run's own text is used. */
  run: () => Promise<boolean>;
  add: (fact: ExpectedFact) => Promise<boolean>;
  remove: (fact: ExpectedFact) => Promise<boolean>;
}

interface Listing {
  file: string;
  facts: ExpectedFact[];
}

const READ_ONLY: EvalsState = {
  editable: false,
  file: null,
  facts: null,
  error: null,
  scored: null,
  running: false,
  run: async () => false,
  add: async () => false,
  remove: async () => false,
};

/** The run's evals file, shared by the Evals page and the document view that adds to it. */
export const EvalsContext = createContext<EvalsState>(READ_ONLY);

export function useEvalsState(): EvalsState {
  return useContext(EvalsContext);
}

/**
 * The evals file beside the documents a report read. With `source`, the report came from
 * `complydoc ui`, which reads and writes the file; without it, the facts are the ones the
 * run checked, read only.
 */
export function useEvals(source?: string): EvalsState {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scored, setScored] = useState<EvalSummary | null>(null);
  const [running, setRunning] = useState(false);
  const url = source ? `${source}/evals` : null;

  // The newest request wins: an earlier one that answers late is about facts since changed.
  const asked = useRef(0);

  const run = useCallback(async () => {
    if (!url) return false;
    const mine = ++asked.current;
    const latest = () => mine === asked.current;
    setRunning(true);
    try {
      const response = await fetch(`${url}/score`);
      if (!response.ok) {
        const said = await response.text();
        if (latest()) setError(said);
        return false;
      }
      const scores = (await response.json()) as EvalSummary;
      if (!latest()) return false;
      setScored(scores);
      setError(null);
      return true;
    } catch (reason) {
      if (latest()) setError(reason instanceof Error ? reason.message : "complydoc ui could not be reached.");
      return false;
    } finally {
      if (latest()) setRunning(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    const abort = new AbortController();
    fetch(url, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) return setListing(null);
        setListing((await response.json()) as Listing);
        // With a file to read, the facts in it are run at once: the page opens on scores as they are.
        void run();
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [url, run]);

  const write = useCallback(
    async (method: "POST" | "DELETE", fact: ExpectedFact) => {
      if (!url) return false;
      try {
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: fact.text, document: fact.document ?? null }),
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
    editable: listing !== null && !servedReadOnly(),
    file: listing?.file ?? null,
    facts: listing?.facts ?? null,
    error,
    scored,
    running,
    run,
    add: async (fact) => {
      const done = await write("POST", fact);
      if (done) {
        toast("Expected, and checked against this run");
        void run();
      }
      return done;
    },
    remove: async (fact) => {
      const done = await write("DELETE", fact);
      if (done) {
        toast("No longer expected");
        void run();
      }
      return done;
    },
  };
}
