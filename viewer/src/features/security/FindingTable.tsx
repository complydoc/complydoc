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

const columns: Columns<FindingRow> = [
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
    cell: ({ row, getValue }) => (
      <span className="flex items-center gap-2">
        <code className="font-mono text-xs">{getValue()}</code>
        {row.original.count > 1 && (
          <span className="text-xs text-muted-foreground tabular-nums" title={`Found ${row.original.count} times`}>
            ×{row.original.count}
          </span>
        )}
      </span>
    ),
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
    // Every page the value is on; a long list is cut, and says how many more.
    cell: ({ row }) => {
      const { pages } = row.original;
      if (pages.length === 0) return "–";
      const shown = pages.slice(0, 3).join(", ");
      return pages.length > 3 ? `${shown} +${pages.length - 3}` : shown;
    },
    meta: { numeric: true },
  }),
  column.accessor("severity", {
    header: "Severity",
    sortingFn: (a, b) => SEVERITIES.indexOf(a.original.severity) - SEVERITIES.indexOf(b.original.severity),
    cell: (c) => <SeverityIcon severity={c.getValue()} />,
  }),
  column.accessor("evidence", {
    header: "Confidence",
    sortingFn: (a, b) =>
      EVIDENCE.findIndex((e) => e.key === a.original.evidence) - EVIDENCE.findIndex((e) => e.key === b.original.evidence),
    cell: ({ row, getValue }) => <EvidenceBadge evidence={getValue()} match={row.original.source} icon />,
  }),
  column.display({
    id: "ignore",
    header: () => <span className="sr-only">Ignore</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <IgnoreButton fingerprint={row.original.source.fingerprint} what={`${row.original.label} ${row.original.masked}`} />
      </div>
    ),
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
