import { createColumnHelper } from "@tanstack/react-table";
import { FolderIcon } from "lucide-react";
import { DataTable, type Columns } from "@/components/DataTable";
import { Section, SectionStack } from "@/components/Section";
import { Stat, StatGrid } from "@/components/Stat";
import { ToneBadge } from "@/components/ToneBadge";
import { measured } from "@/report/measured";
import { isPipeline, leadRun, runLabel, type Collection } from "@/report/collections";
import { formatCount, formatPageUsd, formatScore, formatSeconds, plural } from "@/report/format";
import { EMPTY, combine, reportTotals, type Totals } from "@/report/planEstimate";
import { planFor } from "@/report/planChoice";
import { bandTone } from "@/report/select";
import type { Band } from "@/report/types";
import { PipelinesTable } from "./PipelinesTable";

interface Row {
  id: string;
  name: string;
  path: string;
  runs: number;
  lastRun: string;
  /** Null where the run did not measure it: shown as not measured, never as nought. */
  readiness: number | null;
  /** The band complydoc put that score in. */
  band: Band | null;
  sensitive: number | null;
  hidden: number | null;
  totals: Totals;
}

function rowsOf(collections: Collection[]): Row[] {
  return collections.flatMap((collection) => {
    // The folder is summed up by its newest run that read documents; a chunks run holds none.
    const latest = leadRun(collection);
    if (!latest) return [];
    const report = latest.report;
    const scanned = measured(report, "sensitive");
    return [
      {
        id: collection.id,
        name: collection.name,
        path: collection.id,
        runs: collection.runs.length,
        lastRun: runLabel(collection.runs[0]?.report ?? report),
        readiness: measured(report, "readiness") ? report.overall.score : null,
        band: report.overall.label,
        sensitive: scanned ? report.aggregate.sensitive_total : null,
        hidden: scanned ? report.aggregate.content_findings_total : null,
        totals: reportTotals(report, planFor(report)),
      },
    ];
  });
}

/** A figure the folder's last run did not measure. */
function NotMeasured() {
  return (
    <span className="text-xs text-muted-foreground" title="The last run did not measure this">
      not measured
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
    // Pairs of figures share a column, the second beneath, so the table fits beside the sidebar.
    column.accessor((row) => row.totals.documents, {
      id: "documents",
      header: "Documents",
      cell: ({ row, getValue }) => (
        <span className="flex flex-col items-end tabular-nums">
          <span>{formatCount(getValue())}</span>
          <span className="text-xs text-muted-foreground">{plural(row.original.totals.pages, "page")}</span>
        </span>
      ),
      ...numeric,
    }),
    column.accessor((row) => row.readiness ?? undefined, {
      id: "readiness",
      header: "Readiness",
      cell: ({ row }) => (
        <span>
          {row.original.readiness === null ? (
            <NotMeasured />
          ) : (
            <ToneBadge tone={bandTone(row.original.band)}>{formatScore(row.original.readiness)}</ToneBadge>
          )}
        </span>
      ),
      ...numeric,
    }),
    column.accessor((row) => row.sensitive ?? undefined, {
      id: "sensitive",
      header: "Identifiers",
      cell: ({ row }) =>
        row.original.sensitive === null ? (
          <NotMeasured />
        ) : (
          <span className="tabular-nums">{formatCount(row.original.sensitive)}</span>
        ),
      ...numeric,
    }),
    column.accessor((row) => row.hidden ?? undefined, {
      id: "hidden",
      header: "Hidden",
      cell: ({ row }) => (row.original.hidden === null ? <NotMeasured /> : formatCount(row.original.hidden)),
      ...numeric,
    }),
    column.accessor((row) => row.totals.usd ?? undefined, {
      id: "cost",
      header: "Cost · time",
      cell: ({ row, getValue }) => {
        const seconds = row.original.totals.seconds;
        return (
          <span className="flex flex-col items-end tabular-nums">
            <span>{formatPageUsd(getValue() ?? null)}</span>
            <span className="text-xs text-muted-foreground">
              {seconds === null ? "not timed" : formatSeconds(seconds)}
            </span>
          </span>
        );
      },
      ...numeric,
    }),
  ];
}

/**
 * Every folder open, side by side: what each holds, how ready and how exposed
 * it is, and what reading it costs and takes under the plan chosen. Pipelines follow on
 * their own: they read documents a folder may also hold, so adding them in would count
 * those documents twice.
 */
export function OverviewPage({ collections, onOpen }: { collections: Collection[]; onOpen: (id: string) => void }) {
  const pipelines = collections.filter(isPipeline);
  const rows = rowsOf(collections.filter((c) => !isPipeline(c)));
  const all = rows.reduce((sum, row) => combine(sum, row.totals), EMPTY);
  const sensitive = rows.reduce((sum, row) => sum + (row.sensitive ?? 0), 0);
  const unscanned = rows.filter((row) => row.sensitive === null).length;

  return (
    <SectionStack>
      <Section title="Across every folder">
        <StatGrid>
          <Stat label="Folders" value={formatCount(rows.length)} note={plural(all.documents, "document")} />
          <Stat label="Pages" value={formatCount(all.pages)} />
          <Stat
            label="Identifiers"
            value={formatCount(sensitive)}
            {...(unscanned > 0 && { note: `${plural(unscanned, "folder")} not scanned` })}
          />
          <Stat
            label="To read it all"
            value={formatPageUsd(all.usd)}
            note={`${all.seconds === null ? "not timed" : formatSeconds(all.seconds)}, under the plan chosen for each`}
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
      {pipelines.length > 0 && (
        <Section title="Pipelines">
          <PipelinesTable pipelines={pipelines} onOpen={onOpen} />
        </Section>
      )}
    </SectionStack>
  );
}
