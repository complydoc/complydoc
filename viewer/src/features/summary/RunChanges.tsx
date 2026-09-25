import { HistoryIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changeBetween, runLabel } from "@/report/collections";
import { fileName, formatCount, formatScore, plural } from "@/report/format";
import type { Report } from "@/report/types";

function Figure({ label, before, after, better }: { label: string; before: number | null; after: number | null; better: "up" | "down" }) {
  const moved = before !== null && after !== null ? after - before : null;
  const good = moved !== null && (better === "up" ? moved > 0 : moved < 0);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {formatScore(before)} → <span className="font-medium">{formatScore(after)}</span>
        {moved !== null && moved !== 0 && (
          <span className={good ? "text-success" : "text-destructive"}>
            {" "}
            ({moved > 0 ? "+" : "−"}
            {formatCount(Math.abs(Math.round(moved)))})
          </span>
        )}
      </span>
    </div>
  );
}

/** What changed in this folder since the run before this one. */
export function RunChanges({ report, previous }: { report: Report; previous: Report }) {
  const change = changeBetween(report, previous);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-muted-foreground" />
          Since {runLabel(previous)}
        </CardTitle>
        <CardDescription>
          {change.added.length || change.removed.length
            ? [
                change.added.length && `${plural(change.added.length, "document")} added`,
                change.removed.length && `${plural(change.removed.length, "document")} gone`,
              ]
                .filter(Boolean)
                .join(", ")
            : "The same documents as then."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-4">
          <Figure label="Readiness" before={change.readiness.before} after={change.readiness.after} better="up" />
          <Figure label="Sensitive items" before={change.sensitive.before} after={change.sensitive.after} better="down" />
          <Figure label="Hidden passages" before={change.hidden.before} after={change.hidden.after} better="down" />
        </div>
        {(change.added.length > 0 || change.removed.length > 0) && (
          <ul className="flex flex-col gap-1 text-sm">
            {change.added.map((path) => (
              <li key={`+${path}`} className="font-mono text-xs">
                <span className="text-success">+ </span>
                {fileName(path)}
              </li>
            ))}
            {change.removed.map((path) => (
              <li key={`-${path}`} className="font-mono text-xs">
                <span className="text-destructive">− </span>
                {fileName(path)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
