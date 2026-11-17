import { createColumnHelper } from "@tanstack/react-table";
import { CircleDollarSignIcon, FileTextIcon, FileUpIcon, FolderIcon, ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Columns } from "@/components/DataTable";
import { Section, SectionStack } from "@/components/Section";
import { Stat, StatGrid } from "@/components/Stat";
import { HUE_BG, type Hue } from "@/components/hues";
import { ScoreRing } from "@/components/LevelIcons";
import { measured } from "@/report/measured";
import { isPipeline, leadRun, runLabel, type Collection } from "@/report/collections";
import { formatCount, formatPageUsd, formatScore, formatSeconds, plural } from "@/report/format";
import { EMPTY, combine, reportTotals, type Totals } from "@/report/planEstimate";
import { planFor } from "@/report/planChoice";
import { bandCounts, bandTone } from "@/report/select";
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
  /** How many of its documents fall in each readiness band, best first. */
  bands: ReturnType<typeof bandCounts>;
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
        bands: measured(report, "readiness") ? bandCounts(report) : [],
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

const BAND_HUE: Record<string, Hue> = { ready: "mint", workable: "blue", needsWork: "amber", notReady: "coral" };

/** Each folder's documents by readiness band, one strip a folder, so where work is needed shows at a glance. */
function BandStrips({ rows }: { rows: Row[] }) {
  const scored = rows.filter((row) => row.bands.length > 0);
  if (!scored.length) return null;
  const legend = new Map<string, { label: string; count: number }>();
  for (const row of scored)
    for (const band of row.bands) {
      const seen = legend.get(band.id);
      legend.set(band.id, { label: band.label, count: (seen?.count ?? 0) + band.count });
    }
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {scored.map((row) => {
          const total = row.bands.reduce((sum, band) => sum + band.count, 0);
          return (
            <li key={row.id} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-4">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{row.name}</span>
              </span>
              <div
                className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
                role="img"
                aria-label={row.bands.map((band) => `${band.count} ${band.label.toLowerCase()}`).join(", ")}
              >
                {row.bands.map((band) => (
                  <span
                    key={band.id}
                    className={HUE_BG[BAND_HUE[band.id] ?? "blue"]}
                    style={{ width: `${(band.count / total) * 100}%` }}
                  />
                ))}
              </div>
              <span className="figure text-xs text-muted-foreground" title={plural(total, "document")}>
                {total}
              </span>
            </li>
          );
        })}
      </ul>
      <ul aria-label="Bands" className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {[...legend].map(([id, band]) => (
          <li key={id} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-full ${HUE_BG[BAND_HUE[id] ?? "blue"]}`} />
            {band.label}
            <span className="figure text-foreground">{band.count}</span>
          </li>
        ))}
      </ul>
    </div>
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
    column.accessor((row) => row.totals.documents, {
      id: "documents",
      header: "Documents",
      cell: ({ getValue }) => formatCount(getValue()),
      ...numeric,
    }),
    column.accessor((row) => row.totals.pages, {
      id: "pages",
      header: "Pages",
      cell: ({ getValue }) => formatCount(getValue()),
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
            <ScoreRing share={row.original.readiness / 100} tone={bandTone(row.original.band)}>
              {formatScore(row.original.readiness)}
            </ScoreRing>
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
      header: "Cost",
      cell: ({ getValue }) => formatPageUsd(getValue() ?? null),
      ...numeric,
    }),
    column.accessor((row) => row.totals.seconds ?? undefined, {
      id: "time",
      header: "Time",
      cell: ({ getValue }) => {
        const seconds = getValue();
        return seconds === undefined ? <span className="text-muted-foreground">not timed</span> : formatSeconds(seconds);
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
export function OverviewPage({
  collections,
  onOpen,
  onAudit,
}: {
  collections: Collection[];
  onOpen: (id: string) => void;
  /** Where `complydoc ui` takes documents: opens the dialog to audit a new folder. */
  onAudit?: (() => void) | undefined;
}) {
  const pipelines = collections.filter(isPipeline);
  const rows = rowsOf(collections.filter((c) => !isPipeline(c)));
  const all = rows.reduce((sum, row) => combine(sum, row.totals), EMPTY);
  const sensitive = rows.reduce((sum, row) => sum + (row.sensitive ?? 0), 0);
  const unscanned = rows.filter((row) => row.sensitive === null).length;

  return (
    <SectionStack>
      <Section title="Across every folder">
        <StatGrid>
          <Stat
            label="Folders"
            icon={FolderIcon}
            hue="blue"
            value={formatCount(rows.length)}
            note={plural(all.documents, "document")}
          />
          <Stat label="Pages" icon={FileTextIcon} hue="violet" value={formatCount(all.pages)} />
          <Stat
            label="Identifiers"
            icon={ShieldAlertIcon}
            hue="coral"
            value={formatCount(sensitive)}
            {...(unscanned > 0 && { note: `${plural(unscanned, "folder")} not scanned` })}
          />
          <Stat
            label="To read it all"
            icon={CircleDollarSignIcon}
            hue="mint"
            value={formatPageUsd(all.usd)}
            note={`${all.seconds === null ? "not timed" : formatSeconds(all.seconds)}, under the plan chosen for each`}
          />
        </StatGrid>
      </Section>
      {rows.some((row) => row.bands.length > 0) && (
        <Section title="Where the documents stand">
          <BandStrips rows={rows} />
        </Section>
      )}
      <Section
        title="Folders"
        aside={
          onAudit && (
            <Button variant="outline" size="sm" onClick={onAudit}>
              <FileUpIcon />
              Add documents
            </Button>
          )
        }
      >
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
