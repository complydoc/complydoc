import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { ToneBadge } from "@/components/ToneBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fileName } from "@/report/format";
import type { FindingRow } from "@/report/security";
import { EVIDENCE, SEVERITIES, evidenceLabel, severityTone } from "@/report/select";

const column = createColumnHelper<FindingRow>();

const columns: Columns<FindingRow> = [
  column.accessor("label", { header: "Identifier" }),
  column.accessor("masked", { header: "Value", cell: (c) => <code className="font-mono text-xs">{c.getValue()}</code> }),
  column.accessor((row) => fileName(row.path), {
    id: "document",
    header: "Document",
    cell: ({ row, getValue }) => (
      <Button variant="link" className="h-auto p-0" asChild>
        <a href={`#documents/${row.original.document}`}>{getValue()}</a>
      </Button>
    ),
  }),
  column.accessor("page", { header: "Page", cell: (c) => c.getValue() ?? "–", meta: { numeric: true } }),
  column.accessor("severity", {
    header: "Severity",
    sortingFn: (a, b) => SEVERITIES.indexOf(a.original.severity) - SEVERITIES.indexOf(b.original.severity),
    cell: (c) => <ToneBadge tone={severityTone(c.getValue())}>{c.getValue()}</ToneBadge>,
  }),
  column.accessor("evidence", {
    header: "Evidence",
    sortingFn: (a, b) =>
      EVIDENCE.findIndex((e) => e.key === a.original.evidence) - EVIDENCE.findIndex((e) => e.key === b.original.evidence),
    cell: (c) => <Badge variant="outline">{evidenceLabel(c.getValue())}</Badge>,
  }),
];

/** Every identifier found: what it is, its masked value, where it is and how sure complydoc is. */
export function FindingTable({ rows }: { rows: FindingRow[] }) {
  return <DataTable caption="Every finding" columns={columns} rows={rows} rowKey={(row) => row.id} sortable />;
}
