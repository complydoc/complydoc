import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KIND } from "@/features/pipeline/kinds";
import { cn } from "@/lib/utils";
import { plural } from "@/report/format";
import type { RunSighting } from "@/report/findValue";
import type { StepKind } from "@/report/traceView";

/**
 * A run's steps as the trace lists them, with the value followed down: how many times
 * each step passed it on, where it was sent, and the step after which it was gone.
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
          return (
            <TableRow key={step.step} className={cn(!held && "text-muted-foreground")}>
              <TableCell className="text-right tabular-nums text-muted-foreground">{step.step}</TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  <kind.icon className={cn("size-3.5 shrink-0", held ? kind.tone : "opacity-50")} aria-hidden="true" />
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
          );
        })}
      </TableBody>
    </Table>
  );
}
