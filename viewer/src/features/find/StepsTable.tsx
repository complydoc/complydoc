import { Fragment } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KIND } from "@/features/pipeline/kinds";
import { cn } from "@/lib/utils";
import { plural } from "@/report/format";
import type { RunSighting } from "@/report/findValue";
import type { StepKind } from "@/report/traceView";

/**
 * A run's steps as the trace lists them, with the value followed down: how many times
 * each step passed it on, where it was sent, the step after which it was gone, and for a
 * vector store, the items holding it and the call that removes them.
 */
export function StepsTable({ run }: { run: RunSighting }) {
  return (
    // Fixed columns, so the steps of one run line up with the steps of the next.
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 text-right">#</TableHead>
          <TableHead>Step</TableHead>
          <TableHead className="w-28">Kind</TableHead>
          <TableHead className="w-20 text-right">Calls</TableHead>
          <TableHead className="w-28 text-right">The value</TableHead>
          <TableHead className="w-48">Sent to</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {run.steps.map((step) => {
          const kind = KIND[step.kind as StepKind] ?? KIND.custom;
          const held = step.occurrences > 0;
          const last = step.step === run.reached && step.step < run.steps.length;
          const ids = held ? (step.ids ?? []) : [];
          const withheld = held ? (step.withheld ?? 0) : 0;
          return (
            <Fragment key={step.step}>
              <TableRow className={cn(!held && "text-muted-foreground", (ids.length > 0 || withheld > 0) && "border-b-0")}>
                <TableCell className="text-right tabular-nums text-muted-foreground">{step.step}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <kind.icon
                      className={cn("size-3.5 shrink-0", held ? kind.tone : "opacity-50")}
                      aria-hidden="true"
                    />
                    <span className={cn(held && "font-medium")}>{step.component}</span>
                    {last && <span className="text-xs font-normal text-success">last step to hold it</span>}
                  </span>
                </TableCell>
                <TableCell>{kind.label}</TableCell>
                <TableCell className="text-right tabular-nums">{step.calls}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {held ? plural(step.occurrences, "time") : "not there"}
                </TableCell>
                <TableCell className={cn("font-mono text-xs", held && step.hosts.length > 0 && "text-destructive")}>
                  {held && step.hosts.length > 0 ? step.hosts.join(", ") : "—"}
                </TableCell>
              </TableRow>
              {(ids.length > 0 || withheld > 0) && (
                // Where the value stays: the items holding it, and how to take them out.
                <TableRow className="hover:bg-transparent">
                  <TableCell />
                  <TableCell colSpan={5} className="pb-4 whitespace-normal">
                    <div className="flex flex-col gap-2">
                      {ids.length > 0 && (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Stored as {plural(ids.length, "item")}
                            {step.store ? ` in ${step.store}` : ""}. To take the value out of the index:
                          </p>
                          <CodeBlock title="Remove them" lines={[step.delete ?? ids.join("\n")]} />
                        </>
                      )}
                      {withheld > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {plural(withheld, ids.length > 0 ? "more item" : "item")} stored under an ID that holds a path
                          or an identifier, so not named here.
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
