import { createColumnHelper } from "@tanstack/react-table";
import { ChevronRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { DataTable, type Columns } from "@/components/DataTable";
import { ToneBadge } from "@/components/ToneBadge";
import { cn } from "@/lib/utils";
import { formatCount, formatPageUsd, formatPercent, formatScore, formatSeconds } from "@/report/format";
import type { Totals } from "@/report/plan";
import { agreementTone, bandOf, bandTone, severityTone, visionTone } from "@/report/select";
import type { TreeNode } from "@/report/tree";

const column = createColumnHelper<TreeNode>();
const numeric = { meta: { numeric: true }, sortUndefined: "last" } as const;

/** A screen of rows; a folder of hundreds is paged rather than scrolled. */
const ROWS_PER_PAGE = 50;

function Time({ totals }: { totals: Totals }) {
  if (totals.seconds === null) return <span className="text-muted-foreground">not timed</span>;
  const notes = [
    totals.untimed > 0 && `${totals.untimed} of ${totals.pages} pages not timed`,
    totals.averaged && "a loader's time, spread over its pages",
  ].filter(Boolean);
  return (
    <span title={notes.join("; ") || undefined}>
      {totals.averaged && "~"}
      {formatSeconds(totals.seconds)}
      {totals.untimed > 0 && <span className="text-muted-foreground">+</span>}
    </span>
  );
}

function columnsFor(vision: boolean): Columns<TreeNode> {
  const columns: Columns<TreeNode> = [
    column.accessor("name", {
      header: "Name",
      cell: ({ row, getValue }) => {
        const node = row.original;
        const open = row.getIsExpanded();
        const Icon = node.kind === "file" ? FileTextIcon : open ? FolderOpenIcon : FolderIcon;
        return (
          <span className="flex items-center gap-1.5" style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
            {node.kind === "folder" ? (
              <button
                type="button"
                onClick={row.getToggleExpandedHandler()}
                aria-label={`${open ? "Close" : "Open"} ${getValue()}`}
                aria-expanded={open}
                className="rounded-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
              </button>
            ) : (
              <span className="size-4" />
            )}
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            {node.document ? (
              <a
                href={`#documents/${node.document.index}`}
                title={node.document.path}
                className="font-medium underline-offset-4 hover:underline"
              >
                {getValue()}
              </a>
            ) : (
              <span className="font-medium">{getValue()}</span>
            )}
            {node.kind === "folder" && (
              <span className="text-xs text-muted-foreground">{formatCount(node.totals.documents)}</span>
            )}
          </span>
        );
      },
    }),
    column.accessor((node) => node.totals.pages, { id: "pages", header: "Pages", cell: (c) => formatCount(c.getValue()), ...numeric }),
    column.accessor((node) => node.score ?? undefined, {
      id: "score",
      header: "Readiness",
      cell: (c) => {
        const score = c.getValue() ?? null;
        return <ToneBadge tone={bandTone(bandOf(score))}>{formatScore(score)}</ToneBadge>;
      },
      ...numeric,
    }),
    column.accessor((node) => node.document?.agreement ?? undefined, {
      id: "agreement",
      header: "Readers agree",
      cell: ({ row, getValue }) => {
        const value = getValue();
        if (value === undefined) return "–";
        return (
          <ToneBadge tone={agreementTone(value)}>
            {formatPercent(value)}
            {row.original.document?.reordered && " · reordered"}
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
  if (vision) {
    columns.push(
      column.accessor((node) => node.document?.vision?.disagree, {
        id: "vision",
        header: "Vision check",
        cell: ({ row }) => {
          const check = row.original.document?.vision;
          if (!check) return "–";
          return (
            <ToneBadge tone={visionTone(check)}>
              {check.disagree > 0 ? `${check.disagree} of ${check.checked} disagree` : `${check.checked} checked`}
            </ToneBadge>
          );
        },
        ...numeric,
      }),
    );
  }
  columns.push(
    column.accessor((node) => node.totals.usd ?? undefined, {
      id: "cost",
      header: "Cost",
      cell: (c) => <span className="tabular-nums">{formatPageUsd(c.getValue() ?? null)}</span>,
      ...numeric,
    }),
    column.accessor((node) => node.totals.seconds ?? undefined, {
      id: "time",
      header: "Time to read",
      cell: ({ row }) => (
        <span className="tabular-nums">
          <Time totals={row.original.totals} />
        </span>
      ),
      ...numeric,
    }),
  );
  return columns;
}

/**
 * Every document, in the folders it came from. Each folder adds up what its
 * documents cost and take to read under the plan chosen in the top bar.
 */
export function DocumentTree({ nodes, vision }: { nodes: TreeNode[]; vision: boolean }) {
  return (
    <DataTable
      caption="Documents"
      columns={columnsFor(vision)}
      rows={nodes}
      rowKey={(node) => node.id}
      subRows={(node) => node.children}
      sortable
      search="Search documents"
      pageSize={ROWS_PER_PAGE}
    />
  );
}
