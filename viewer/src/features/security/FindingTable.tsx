import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { SeverityIcon } from "@/components/LevelIcons";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DownloadIcon } from "lucide-react";
import { toCsv, saveText } from "@/report/csv";
import { fileName, humanise } from "@/report/format";
import { documentHref } from "@/report/route";
import type { FindingRow } from "@/report/security";
import { EVIDENCE, SEVERITIES } from "@/report/select";
import type { Severity } from "@/report/types";
import { useHashParam } from "@/hooks/useHashRoute";
import { IgnoreButton } from "./IgnoreButton";

const column = createColumnHelper<FindingRow>();

// As Linear lays out a list: the severity as an icon leading the row, the text columns
// taking the room, and the figures, confidence and action as narrow columns at the end.
const columns: Columns<FindingRow> = [
  column.accessor("severity", {
    header: () => <span className="sr-only">Severity</span>,
    sortingFn: (a, b) => SEVERITIES.indexOf(a.original.severity) - SEVERITIES.indexOf(b.original.severity),
    cell: (c) => <SeverityIcon severity={c.getValue()} />,
    meta: { narrow: true },
  }),
  // What was found and its masked value in one column, and where in another, so the table
  // fits beside the sidebar without scrolling sideways. Each still searches on both parts.
  column.accessor((row) => `${row.label} ${row.masked}`, {
    id: "finding",
    header: "Finding",
    sortingFn: (a, b) => a.original.label.localeCompare(b.original.label),
    // Opens the document on the finding's page with the finding marked.
    cell: ({ row }) => (
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <Button variant="link" className="h-auto p-0 font-medium" asChild>
          <a href={documentHref(row.original.document, row.original.page, { kind: "identifier", index: row.original.match })}>
            {row.original.label}
          </a>
        </Button>
        <code className="font-mono text-xs text-muted-foreground">{row.original.masked}</code>
      </span>
    ),
  }),
  column.accessor((row) => `${fileName(row.path)} ${row.page ?? ""}`, {
    id: "where",
    header: "Where",
    sortingFn: (a, b) =>
      a.original.path.localeCompare(b.original.path) || (a.original.page ?? 0) - (b.original.page ?? 0),
    cell: ({ row }) => (
      <span className="flex min-w-0 flex-col gap-0.5">
        <a
          href={documentHref(row.original.document)}
          className="truncate underline-offset-4 hover:underline"
          title={row.original.path}
        >
          {fileName(row.original.path)}
        </a>
        {row.original.page !== null && (
          <span className="text-xs text-muted-foreground">page {row.original.page}</span>
        )}
      </span>
    ),
  }),
  column.accessor("evidence", {
    header: "Confidence",
    sortingFn: (a, b) =>
      EVIDENCE.findIndex((e) => e.key === a.original.evidence) - EVIDENCE.findIndex((e) => e.key === b.original.evidence),
    cell: ({ row, getValue }) => (
      <div className="flex justify-center">
        <EvidenceBadge evidence={getValue()} match={row.original.source} icon />
      </div>
    ),
    meta: { narrow: true },
  }),
  column.display({
    id: "ignore",
    header: () => <span className="sr-only">Ignore</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <IgnoreButton fingerprint={row.original.source.fingerprint} what={`${row.original.label} ${row.original.masked}`} />
      </div>
    ),
    meta: { narrow: true },
  }),
];

/** The findings as a spreadsheet has them: masked, as the report holds them, with their fingerprints. */
function findingsCsv(rows: FindingRow[]): string {
  return toCsv(
    ["severity", "identifier", "value", "document", "page", "confidence", "fingerprint"],
    rows.map((row) => [
      row.severity,
      row.label,
      row.masked,
      row.path,
      row.page,
      row.evidence,
      row.source.fingerprint,
    ]),
  );
}

/**
 * Every identifier found: what it is, its masked value, where it is and how sure
 * complydoc is. Searchable, filtered by severity, and a page of rows at a time.
 */
export function FindingTable({ rows }: { rows: FindingRow[] }) {
  // In the address, so a view of one severity can be linked and reopened.
  const [param, setParam] = useHashParam("severity");
  const severity: Severity | "all" = SEVERITIES.includes(param as Severity) ? (param as Severity) : "all";
  const setSeverity = (value: Severity | "all") => setParam(value === "all" ? null : value);
  const shown = severity === "all" ? rows : rows.filter((row) => row.severity === severity);
  const count = (s: Severity) => rows.filter((row) => row.severity === s).length;
  return (
    <DataTable
      caption="Every finding"
      columns={columns}
      rows={shown}
      rowKey={(row) => row.id}
      sortable
      search="Search findings or documents"
      pageSize={25}
      rowHref={(row) => documentHref(row.document, row.page, { kind: "identifier", index: row.match })}
      toolbar={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={severity}
          aria-label="Severity"
          onValueChange={(value) => value && setSeverity(value as Severity | "all")}
        >
          <ToggleGroupItem value="all">All {rows.length}</ToggleGroupItem>
          {SEVERITIES.map((s) => (
            <ToggleGroupItem key={s} value={s} disabled={count(s) === 0}>
              <SeverityIcon severity={s} />
              {humanise(s)} {count(s)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
      actions={
        <Button variant="outline" size="sm" onClick={() => saveText("complydoc-findings.csv", findingsCsv(shown))}>
          <DownloadIcon />
          Download {severity === "all" ? "all" : `${humanise(severity).toLowerCase()} severity`} as CSV
        </Button>
      }
    />
  );
}
