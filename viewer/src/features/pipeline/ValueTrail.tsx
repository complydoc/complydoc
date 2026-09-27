import { useState } from "react";
import { SeverityIcon } from "@/components/LevelIcons";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCount } from "@/report/format";
import { trailsOf, type Step } from "@/report/traceView";
import { KIND } from "./kinds";

/** Identifiers listed before the rest wait behind a button. */
const SHOWN = 15;

function Cell({ value }: { value: number | null }) {
  if (value === null)
    return (
      <span className="text-xs text-muted-foreground/60" title="Not looked for at this step">
        ·
      </span>
    );
  if (value === 0)
    return <span className="inline-block size-2.5 rounded-full border border-muted-foreground/40" title="Not there" />;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" title={`${value} times`}>
      <span className="inline-block size-2.5 rounded-full bg-foreground" />
      {value > 1 && <span className="text-xs text-muted-foreground">{value}</span>}
    </span>
  );
}

/**
 * Every identifier the pipeline met, and which steps it was in: where it came in, where a
 * step removed it, and whether it reached the end. Those that reached the end come first.
 */
export function ValueTrail({ steps, selected }: { steps: Step[]; selected: number }) {
  const [all, setAll] = useState(false);
  const trails = trailsOf(steps);
  if (trails.length === 0) return <p className="text-sm text-muted-foreground">No identifier was found at any step.</p>;
  const shown = all ? trails : trails.slice(0, SHOWN);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border">
        <Table aria-label="Where each identifier went">
          <TableHeader>
            <TableRow>
              <TableHead>Identifier</TableHead>
              {steps.map((step) => (
                <TableHead
                  key={step.index}
                  className={cn("text-center", step.index === selected && "bg-muted/60 text-foreground")}
                  title={step.component}
                >
                  {step.index + 1}. {KIND[step.kind].label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((trail) => (
              <TableRow key={trail.identifier.fingerprint}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <SeverityIcon severity={trail.identifier.severity} className="shrink-0" />
                    <span className="font-medium">{trail.identifier.label}</span>
                    <code className="font-mono text-xs text-muted-foreground">{trail.identifier.masked}</code>
                  </span>
                </TableCell>
                {trail.cells.map((value, index) => (
                  <TableCell key={index} className={cn("text-center", index === selected && "bg-muted/60")}>
                    <Cell value={value} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {trails.length > SHOWN && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((current) => !current)}>
          {all ? "Show fewer" : `Show ${formatCount(trails.length - SHOWN)} more`}
        </Button>
      )}
    </div>
  );
}
