import { createColumnHelper } from "@tanstack/react-table";
import { FolderIcon } from "lucide-react";
import { DataTable, type Columns } from "@/components/DataTable";
import { Section, SectionStack } from "@/components/Section";
import { Stat, StatGrid } from "@/components/Stat";
import { ToneBadge } from "@/components/ToneBadge";
import { changeBetween, runLabel, type Collection } from "@/report/collections";
import { formatCount, formatPageUsd, formatScore, formatSeconds, plural } from "@/report/format";
import { EMPTY, combine, reportTotals, type Totals } from "@/report/plan";
import { planFor } from "@/report/planChoice";
import { bandOf, bandTone } from "@/report/select";

interface Row {
  id: string;
  name: string;
  path: string;
  runs: number;
  lastRun: string;
  readiness: number | null;
  /** Change since the run before, where there is one. */
  readinessChange: number | null;
  sensitive: number;
  sensitiveChange: number | null;
  hidden: number;
  totals: Totals;
}

function rowsOf(collections: Collection[]): Row[] {
  return collections.flatMap((collection) => {
    const [latest, previous] = collection.runs;
    if (!latest) return [];
    const report = latest.report;
    const change = previous ? changeBetween(report, previous.report) : null;
    const before = change?.readiness.before;
    return [
      {
        id: collection.id,
        name: collection.name,
        path: collection.id,
        runs: collection.runs.length,
        lastRun: runLabel(report),
        readiness: report.overall.score,
        readinessChange:
          change && before !== null && before !== undefined && report.overall.score !== null
            ? report.overall.score - before
            : null,
        sensitive: report.aggregate.sensitive_total,
        sensitiveChange: change ? change.sensitive.after - change.sensitive.before : null,
        hidden: report.aggregate.content_findings_total,
        totals: reportTotals(report, planFor(report)),
      },
    ];
  });
}

/** A change since the last run, coloured by whether it is better: more readiness is, more findings are not. */
function Change({ value, better }: { value: number | null; better: "up" | "down" }) {
  if (value === null || value === 0) return null;
  const good = better === "up" ? value > 0 : value < 0;
  return (
    <span className={good ? "text-success" : "text-destructive"} title="since the run before">
      {" "}
      {value > 0 ? "▲" : "▼"}
      {formatCount(Math.abs(Math.round(value)))}
    </span>
  );
}

const column = createColumnHelper<Row>();
const numeric = { meta: { numeric: true }, sortUndefined: "last" } as const;

function columnsFor(onOpen: (id: string) => void): Columns<Row> {
  return [
    column.accessor("name", {
      header: "Folder",
      cell: ({ row, getValue }) => (
        <button
          type="button"
          onClick={() => onOpen(row.original.id)}
          title={row.original.path}
          className="flex items-center gap-2 text-left font-medium underline-offset-4 hover:underline"
        >
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          {getValue()}
        </button>
      ),
    }),
    column.accessor("lastRun", {
      header: "Last run",
      cell: ({ row, getValue }) => (
        <span className="text-muted-foreground">
          {getValue()}
          {row.original.runs > 1 && <span className="text-xs"> · {plural(row.original.runs, "run")}</span>}
        </span>
      ),
    }),
    column.accessor((row) => row.totals.documents, { id: "documents", header: "Documents", cell: (c) => formatCount(c.getValue()), ...numeric }),
    column.accessor((row) => row.totals.pages, { id: "pages", header: "Pages", cell: (c) => formatCount(c.getValue()), ...numeric }),
    column.accessor((row) => row.readiness ?? undefined, {
      id: "readiness",
      header: "Readiness",
      cell: ({ row }) => (
        <span>
          <ToneBadge tone={bandTone(bandOf(row.original.readiness))}>{formatScore(row.original.readiness)}</ToneBadge>
          <Change value={row.original.readinessChange} better="up" />
        </span>
      ),
      ...numeric,
    }),
    column.accessor("sensitive", {
      header: "Sensitive",
      cell: ({ row, getValue }) => (
        <span className="tabular-nums">
          {formatCount(getValue())}
          <Change value={row.original.sensitiveChange} better="down" />
        </span>
      ),
      ...numeric,
    }),
    column.accessor("hidden", { header: "Hidden", cell: (c) => formatCount(c.getValue()), ...numeric }),
    column.accessor((row) => row.totals.usd ?? undefined, {
      id: "cost",
      header: "Cost",
      cell: (c) => <span className="tabular-nums">{formatPageUsd(c.getValue() ?? null)}</span>,
      ...numeric,
    }),
    column.accessor((row) => row.totals.seconds ?? undefined, {
      id: "time",
      header: "Time to read",
      cell: (c) => {
        const seconds = c.getValue();
        return <span className="tabular-nums">{seconds === undefined ? "not timed" : formatSeconds(seconds)}</span>;
      },
      ...numeric,
    }),
  ];
}

/**
 * Every folder open, side by side: what each holds, how ready and how exposed
 * it is, what reading it costs and takes under the plan chosen, and what
 * changed since the run before.
 */
export function OverviewPage({ collections, onOpen }: { collections: Collection[]; onOpen: (id: string) => void }) {
  const rows = rowsOf(collections);
  const all = rows.reduce((sum, row) => combine(sum, row.totals), EMPTY);
  const sensitive = rows.reduce((sum, row) => sum + row.sensitive, 0);

  return (
    <SectionStack>
      <Section title="All collections">
        <StatGrid>
          <Stat label="Folders" value={formatCount(rows.length)} note={plural(all.documents, "document")} />
          <Stat label="Pages" value={formatCount(all.pages)} />
          <Stat label="Sensitive items" value={formatCount(sensitive)} />
          <Stat label="Cost to read" value={formatPageUsd(all.usd)} note="under the plan chosen for each" />
          <Stat
            label="Time to read"
            value={all.seconds === null ? "–" : formatSeconds(all.seconds)}
            note="on the machines that ran the audits"
          />
        </StatGrid>
      </Section>
      <Section title="Folders">
        <DataTable
          caption="Folders"
          columns={columnsFor(onOpen)}
          rows={rows}
          rowKey={(row) => row.id}
          sortable
          search="Search folders"
          pageSize={50}
        />
      </Section>
    </SectionStack>
  );
}
