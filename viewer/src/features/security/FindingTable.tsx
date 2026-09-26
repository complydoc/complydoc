import { createColumnHelper } from "@tanstack/react-table";
import { useState } from "react";
import { DataTable, type Columns } from "@/components/DataTable";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { SeverityIcon } from "@/components/LevelIcons";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fileName, humanise } from "@/report/format";
import { documentHref } from "@/report/route";
import type { FindingRow } from "@/report/security";
import { EVIDENCE, SEVERITIES } from "@/report/select";
import type { Severity } from "@/report/types";
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
  column.accessor("label", {
    header: "Identifier",
    // Opens the document on the finding's page with the finding marked.
    cell: ({ row, getValue }) => (
      <Button variant="link" className="h-auto p-0 font-medium" asChild>
        <a href={documentHref(row.original.document, row.original.page, { kind: "identifier", index: row.original.match })}>
          {getValue()}
        </a>
      </Button>
    ),
  }),
  column.accessor("masked", {
    header: "Value",
    cell: (c) => <code className="font-mono text-xs">{c.getValue()}</code>,
  }),
  column.accessor((row) => fileName(row.path), {
    id: "document",
    header: "Document",
    cell: ({ row, getValue }) => (
      <a href={documentHref(row.original.document)} className="text-muted-foreground underline-offset-4 hover:underline">
        {getValue()}
      </a>
    ),
  }),
  column.accessor("page", {
    header: "Page",
    cell: (c) => c.getValue() ?? "–",
    meta: { numeric: true, narrow: true },
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

/**
 * Every identifier found: what it is, its masked value, where it is and how sure
 * complydoc is. Searchable, filtered by severity, and a page of rows at a time.
 */
export function FindingTable({ rows }: { rows: FindingRow[] }) {
  const [severity, setSeverity] = useState<Severity | "all">("all");
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
    />
  );
}
