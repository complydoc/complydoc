import { useEffect, useRef, type ReactNode } from "react";
import { EvidenceIcon, SeverityIcon } from "@/components/LevelIcons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { PageFinding } from "@/report/pageFindings";

export type PanelView = "findings" | "page";

interface FindingsPanelProps {
  findings: PageFinding[];
  /** The finding in hand, drawn out in the list as it is in the text. */
  active: string | null;
  isIgnored: (finding: PageFinding) => boolean;
  onPick: (key: string) => void;
  /** Whether identifiers were looked for at all, so an empty list is not read as a clean one. */
  scanned: boolean;
  /** The page being read, whose findings the list keeps in view. */
  current: number;
  /** The page's picture and what a vision model made of it, when the report has either. */
  page?: ReactNode;
  view: PanelView;
  onView: (view: PanelView) => void;
}

/** The findings of one page, or of the document where a finding has no page. */
function Group({ page, title, children }: { page: number | null; title: string; children: ReactNode }) {
  return (
    <li data-group={page ?? "document"}>
      <p className="sticky top-0 z-10 bg-card/95 px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
        {title}
      </p>
      <ul className="flex flex-col">{children}</ul>
    </li>
  );
}

function FindingItem({
  finding,
  active,
  ignored,
  onPick,
}: {
  finding: PageFinding;
  active: boolean;
  ignored: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={active || undefined}
        className={cn(
          "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60",
          active && "bg-primary/10 hover:bg-primary/15",
          ignored && "opacity-55",
        )}
      >
        <SeverityIcon severity={finding.severity} className="mt-0.5 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-1.5 text-sm">
            <span className={cn("font-medium", ignored && "line-through")}>{finding.label}</span>
            {finding.count > 1 && <span className="text-xs text-muted-foreground">×{finding.count}</span>}
            {ignored && <span className="text-xs text-muted-foreground">ignored</span>}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground" title={finding.value}>
            {finding.value}
          </span>
        </span>
        {finding.evidence && <EvidenceIcon evidence={finding.evidence} className="mt-0.5 shrink-0" />}
      </button>
    </li>
  );
}

/**
 * Beside the text: everything found in the document, page by page, the finding in hand
 * drawn out. A click goes to it in the text. Where the report holds the page's picture,
 * the panel can show that instead.
 */
export function FindingsPanel({
  findings,
  active,
  isIgnored,
  onPick,
  scanned,
  current,
  page,
  view,
  onView,
}: FindingsPanelProps) {
  const list = useRef<HTMLUListElement>(null);
  const groups = new Map<number | null, PageFinding[]>();
  for (const finding of findings) groups.set(finding.page, [...(groups.get(finding.page) ?? []), finding]);
  const showing = page ? view : "findings";

  // The list follows the text: reading a page brings that page's findings into view.
  useEffect(() => {
    const container = list.current;
    const group = container?.querySelector<HTMLElement>(`[data-group="${current}"]`);
    if (container && group) container.scrollTo({ top: group.offsetTop, behavior: "smooth" });
  }, [current]);

  return (
    <aside
      aria-label="Findings"
      className="hidden min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card xl:flex"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        {page ? (
          <ToggleGroup
            type="single"
            size="sm"
            value={showing}
            onValueChange={(next) => next && onView(next as PanelView)}
            aria-label="Beside the text"
          >
            <ToggleGroupItem value="findings">Findings</ToggleGroupItem>
            <ToggleGroupItem value="page">Page</ToggleGroupItem>
          </ToggleGroup>
        ) : (
          <span className="text-sm font-medium">Findings</span>
        )}
      </div>

      {showing === "page" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-2">{page}</div>
      ) : findings.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {scanned ? "Nothing was found in this document." : "Identifiers were not looked for in this run."}
        </p>
      ) : (
        <ul ref={list} className="relative min-h-0 flex-1 overflow-y-auto pb-2">
          {[...groups].map(([number, items]) => (
            <Group key={number ?? "document"} page={number} title={number === null ? "Document" : `Page ${number}`}>
              {items.map((finding) => (
                <FindingItem
                  key={finding.key}
                  finding={finding}
                  active={finding.key === active}
                  ignored={isIgnored(finding)}
                  onPick={() => onPick(finding.key)}
                />
              ))}
            </Group>
          ))}
        </ul>
      )}
    </aside>
  );
}
