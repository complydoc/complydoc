import { HistoryIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { changeBetween, runLabel, type DocumentChange } from "@/report/collections";
import { documentHref } from "@/report/route";
import { formatCount, formatScore, plural } from "@/report/format";
import type { Report } from "@/report/types";

function Figure({
  label,
  change,
  better,
}: {
  label: string;
  change: { before: number | null; after: number | null } | null;
  better: "up" | "down";
}) {
  if (change === null) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm text-muted-foreground" title="One of the two runs did not measure this the same way">
          Not comparable
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Delta {...change} better={better} />
    </div>
  );
}

/** A figure then and now, and by how much it moved, coloured by whether that is better. */
function Delta({ before, after, better }: { before: number | null; after: number | null; better: "up" | "down" }) {
  const moved = before !== null && after !== null ? after - before : null;
  const good = moved !== null && (better === "up" ? moved > 0 : moved < 0);
  return (
    <span className="tabular-nums">
      {formatScore(before)} → <span className="font-medium">{formatScore(after)}</span>
      {moved !== null && Math.round(moved) !== 0 && (
        <span className={good ? "text-success" : "text-destructive"}>
          {" "}
          ({moved > 0 ? "+" : "−"}
          {formatCount(Math.abs(Math.round(moved)))})
        </span>
      )}
    </span>
  );
}

/** Each document whose figures moved, as an experiment comparison lists each example. */
function DocumentChanges({ report, changes }: { report: Report; changes: DocumentChange[] }) {
  const shown = changes.slice(0, LISTED);
  return (
    <Table aria-label="Documents that changed">
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead className="text-right">Identifiers</TableHead>
          <TableHead className="text-right">Readiness</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shown.map((change) => {
          const index = report.documents.findIndex((d) => d.relative_path === change.path);
          return (
            <TableRow key={change.path}>
              <TableCell className="max-w-[16rem] truncate">
                <a href={documentHref(index)} className="hover:underline" title={change.path}>
                  {change.path}
                </a>
              </TableCell>
              <TableCell className="text-right">
                {change.identifiers ? <Delta {...change.identifiers} better="down" /> : "–"}
              </TableCell>
              <TableCell className="text-right">
                {change.readiness ? <Delta {...change.readiness} better="up" /> : "–"}
              </TableCell>
            </TableRow>
          );
        })}
        {changes.length > shown.length && (
          <TableRow>
            <TableCell colSpan={3} className="text-xs text-muted-foreground">
              and {formatCount(changes.length - shown.length)} more
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/** Documents named before the rest are counted. */
const LISTED = 12;

/** What changed in this folder since the run before this one. */
export function RunChanges({ report, previous }: { report: Report; previous: Report }) {
  const change = changeBetween(report, previous);
  // Paths in full: two files of one name in different folders are different documents.
  const every = [
    ...change.added.map((path) => ({ path, added: true })),
    ...change.removed.map((path) => ({ path, added: false })),
  ];
  const listed = every.slice(0, LISTED);
  const unlisted = every.length - listed.length;
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
          <Figure label="Readiness" change={change.readiness} better="up" />
          <Figure label="Identifiers" change={change.sensitive} better="down" />
          <Figure label="Hidden passages" change={change.hidden} better="down" />
        </div>
        {(change.added.length > 0 || change.removed.length > 0) && (
          <ul className="flex flex-col gap-1 text-sm">
            {listed.map(({ path, added }) => (
              <li key={`${added ? "+" : "-"}${path}`} className="font-mono text-xs break-all">
                {added ? <span className="text-success">+ </span> : <span className="text-destructive">− </span>}
                {path}
              </li>
            ))}
            {unlisted > 0 && <li className="text-xs text-muted-foreground">and {formatCount(unlisted)} more</li>}
          </ul>
        )}
        {change.documents.length > 0 && <DocumentChanges report={report} changes={change.documents} />}
      </CardContent>
    </Card>
  );
}
