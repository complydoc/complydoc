import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useContext, useState } from "react";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { cn } from "@/lib/utils";
import { traceOf } from "@/report/auditTrace";
import { formatSeconds, formatUsd } from "@/report/format";
import { traceTotals } from "@/report/traceTree";

const FOLDED_KEY = "complydoc.runs-rail-folded";

function remembered(): boolean {
  try {
    return window.localStorage.getItem(FOLDED_KEY) === "1";
  } catch {
    return false;
  }
}

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

/**
 * Every run of this pipeline in the folder, newest first, each with how long it took, what
 * it cost and how many identifiers it sent away; picking one shows its trace in place.
 * Folds to a strip, and draws nothing for a pipeline run once.
 */
export function RunsRail({ pipeline }: { pipeline: string }) {
  const { runs, current, open } = useContext(FolderRunsContext);
  const [folded, setFolded] = useState(remembered);
  const mine = runs.flatMap((run) => {
    const trace = traceOf(run.report);
    return trace && trace.kind !== "audit" && trace.name === pipeline ? [{ run, trace }] : [];
  });
  if (mine.length < 2) return null;

  const fold = (to: boolean) => {
    setFolded(to);
    try {
      window.localStorage.setItem(FOLDED_KEY, to ? "1" : "0");
    } catch {
      // The rail opens unfolded next time.
    }
  };

  if (folded)
    return (
      <div className="hidden shrink-0 flex-col items-center border-r py-1.5 lg:flex">
        <button
          type="button"
          onClick={() => fold(false)}
          aria-label="Show the runs"
          title="Show the runs"
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpenIcon className="size-4" />
        </button>
      </div>
    );

  return (
    <nav aria-label="Runs" className="hidden w-52 shrink-0 flex-col border-r lg:flex">
      <div className="flex h-9 shrink-0 items-center justify-between border-b pr-1.5 pl-3 text-xs text-muted-foreground">
        <span>
          Runs <span className="font-mono tabular-nums">{mine.length}</span>
        </span>
        <button
          type="button"
          onClick={() => fold(true)}
          aria-label="Hide the runs"
          title="Hide the runs"
          className="flex size-6 items-center justify-center rounded hover:bg-muted hover:text-foreground"
        >
          <PanelLeftCloseIcon className="size-3.5" />
        </button>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto py-1">
        {mine.map(({ run, trace }) => {
          const totals = traceTotals(trace);
          const on = run.id === current;
          const sent = totals.hosts.length > 0 ? totals.identifiersSent : null;
          return (
            <li key={run.id}>
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => {
                  if (on) return;
                  open(run.id);
                  // The call picked belongs to the run left; the new one opens on its own.
                  window.location.assign("#pipeline");
                }}
                className={cn(
                  "relative flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-muted/50",
                  on && "bg-muted hover:bg-muted",
                )}
              >
                {on && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
                <span className="flex items-center gap-1.5 text-sm">
                  <span
                    aria-label={trace.error ? "Raised" : "Finished"}
                    className={cn("size-1.5 shrink-0 rounded-full", trace.error ? "bg-destructive" : "bg-success")}
                  />
                  <span className="truncate tabular-nums">{when(run.report.run.started_at)}</span>
                </span>
                <span className="flex items-center gap-2 pl-3 font-mono text-[11px] text-muted-foreground tabular-nums">
                  <span>{formatSeconds(totals.seconds)}</span>
                  {totals.usd !== null && totals.usd > 0 && <span>{formatUsd(totals.usd)}</span>}
                  {sent !== null && (
                    <span
                      className={cn("ml-auto", sent > 0 ? "text-destructive" : "text-success")}
                      title="Identifiers sent"
                    >
                      {sent} IDs
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
