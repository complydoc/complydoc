import { createContext, useContext } from "react";
import { sameDocument } from "@/report/chunkPlaces";
import { runKind, type Loaded } from "@/report/collections";
import { measured, type Content } from "@/report/measured";

export interface FolderRuns {
  /** Every run of the folder on screen, newest first. */
  runs: Loaded[];
  /** The run on screen. */
  current: string | null;
  open: (run: string) => void;
}

export const FolderRunsContext = createContext<FolderRuns>({ runs: [], current: null, open: () => {} });

/**
 * The newest other run of this folder that holds `content`, and a way to open it: what a
 * page offers before it suggests running a command for something the folder already has.
 */
export function useRunWith(content: Content): { run: Loaded; open: () => void } | null {
  const { runs, current, open } = useContext(FolderRunsContext);
  const run = runs.find((candidate) => candidate.id !== current && measured(candidate.report, content));
  return run ? { run, open: () => open(run.id) } : null;
}

/**
 * A way to a document by its path, in whichever run of the folder holds it: the run on
 * screen first, then the newest audit, then any. Null where no run of the folder does.
 * `query` is kept after the document's address, such as the splitter to draw.
 */
export function useDocumentLink(): (path: string, query?: string) => (() => void) | null {
  const { runs, current, open } = useContext(FolderRunsContext);
  const ordered = [
    ...runs.filter((run) => run.id === current),
    ...runs.filter((run) => run.id !== current && runKind(run.report) === "Audit"),
    ...runs.filter((run) => run.id !== current && runKind(run.report) !== "Audit"),
  ];
  return (path, query) => {
    for (const run of ordered) {
      const index = run.report.documents.findIndex((document) => sameDocument(path, document.relative_path));
      if (index < 0) continue;
      return () => {
        if (run.id !== current) open(run.id);
        window.location.assign(`#documents/${index}${query ? `?${query}` : ""}`);
      };
    }
    return null;
  };
}
