import { ChevronRightIcon, FileTextIcon, SendIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatStarted } from "@/features/pipeline/started";
import { cn } from "@/lib/utils";
import { fate, reachedLabel, type RunSighting } from "@/report/findValue";
import { shortCommit } from "@/report/runContext";
import { StepsTable } from "./StepsTable";

function pages(numbers: number[]): string {
  if (numbers.length === 0) return "";
  return `${numbers.length === 1 ? "page" : "pages"} ${numbers.join(", ")}`;
}

/** What became of the value in this run, in a line. */
function Outcome({ run }: { run: RunSighting }) {
  const how = fate(run);
  if (how === "sent")
    return (
      <span className="flex items-center gap-1.5 text-sm text-destructive">
        <SendIcon className="size-3.5" aria-hidden="true" />
        Sent to {run.sent_to.join(", ")}
      </span>
    );
  if (how === "stopped")
    return (
      <span className="flex items-center gap-1.5 text-sm text-success">
        <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
        Stopped after {reachedLabel(run)}
      </span>
    );
  return (
    <span className="text-sm text-muted-foreground">
      {how === "kept" ? "Held to the last step, sent nowhere" : "Read from the documents"}
    </span>
  );
}

interface RunCardProps {
  run: RunSighting;
  /** Shown with its steps from the start, as the newest runs are. */
  open: boolean;
  /** Open the run itself, where it is one of the runs on screen. */
  onOpen?: () => void;
}

/** One run that held the value: when, from which change, in which documents, and how far it went. */
export function RunCard({ run, open: startsOpen, onOpen }: RunCardProps) {
  const [open, setOpen] = useState(startsOpen);
  const traced = run.steps.length > 0;
  return (
    <li className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
        <button
          type="button"
          disabled={!traced}
          aria-expanded={traced ? open : undefined}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        >
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
              !traced && "invisible",
            )}
            aria-hidden="true"
          />
          <span className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{run.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatStarted(run.started_at)}</span>
              {run.commit && <span className="font-mono text-xs text-muted-foreground">{shortCommit(run.commit)}</span>}
            </span>
            {run.documents.map((document) => (
              <span key={document.path} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileTextIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{document.path}</span>
                <span className="shrink-0 text-xs">{pages(document.pages)}</span>
              </span>
            ))}
          </span>
        </button>
        <Outcome run={run} />
        {onOpen && (
          <Button variant="outline" size="sm" onClick={onOpen}>
            Open the trace
          </Button>
        )}
      </div>
      {traced && open && (
        <div className="border-t bg-muted/20">
          <StepsTable run={run} />
        </div>
      )}
    </li>
  );
}
