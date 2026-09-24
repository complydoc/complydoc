import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { ToneBadge } from "@/components/ToneBadge";
import { Button } from "@/components/ui/button";
import { fileName, formatCount, formatPercent, formatPageUsd, formatScore } from "@/report/format";
import { agreementTone, bandOf, bandTone, severityTone, visionTone, type DocumentRow } from "@/report/select";

const column = createColumnHelper<DocumentRow>();
const numeric = { meta: { numeric: true } } as const;

const columns: Columns<DocumentRow> = [
  column.accessor((row) => fileName(row.path), {
    id: "document",
    header: "Document",
    cell: ({ row, getValue }) => (
      <Button variant="link" className="h-auto p-0" asChild>
        <a href={`#documents/${row.original.index}`} title={row.original.path}>
          {getValue()}
        </a>
      </Button>
    ),
  }),
  column.accessor("format", { header: "Format", cell: (c) => c.getValue().toUpperCase() }),
  column.accessor("pages", { header: "Pages", cell: (c) => formatCount(c.getValue()), ...numeric }),
  column.accessor("score", {
    header: "Readiness",
    sortUndefined: "last",
    cell: (c) => <ToneBadge tone={bandTone(bandOf(c.getValue()))}>{formatScore(c.getValue())}</ToneBadge>,
    ...numeric,
  }),
  column.accessor("agreement", {
    header: "Readers agree",
    cell: ({ row, getValue }) => {
      const value = getValue();
      if (value === null) return "–";
      return (
        <ToneBadge tone={agreementTone(value)}>
          {formatPercent(value)}
          {row.original.reordered && " · reordered"}
        </ToneBadge>
      );
    },
    ...numeric,
  }),
  column.accessor("findings", {
    header: "Sensitive",
    cell: ({ row, getValue }) =>
      row.original.highest ? <ToneBadge tone={severityTone(row.original.highest)}>{formatCount(getValue())}</ToneBadge> : "–",
    ...numeric,
  }),
];

/** Pages a vision model read again, how many it disagreed about, and what the reads cost. */
const visionColumn = column.accessor((row) => row.vision?.disagree, {
  id: "vision",
  header: "Vision check",
  sortUndefined: "last",
  cell: ({ row }) => {
    const vision = row.original.vision;
    if (!vision) return "–";
    const outcome = vision.disagree > 0 ? `${vision.disagree} of ${vision.checked} disagree` : `${vision.checked} checked`;
    return (
      <ToneBadge tone={visionTone(vision)}>
        {outcome}
        {vision.usd !== null && ` · ${formatPageUsd(vision.usd)}`}
      </ToneBadge>
    );
  },
  ...numeric,
});

/** Every document, least ready first. A name opens the document's page comparison. */
export function DocumentTable({ rows }: { rows: DocumentRow[] }) {
  // Only a run that verified pages has anything to put in the column.
  const shown = rows.some((row) => row.vision) ? [...columns, visionColumn] : columns;
  return <DataTable caption="Documents" columns={shown} rows={rows} rowKey={(row) => String(row.index)} sortable />;
}
