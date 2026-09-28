import { ChevronDownIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { EvidenceIcon, SeverityIcon } from "@/components/LevelIcons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { FindingContext, PageFinding } from "@/report/pageFindings";
import { FindingBody } from "./FindingBody";

export type PanelView = "findings" | "page";

interface FindingsPanelProps {
  findings: PageFinding[];
  /** The finding in hand, open in the list and drawn out in the text. */
  active: string | null;
  isIgnored: (finding: PageFinding) => boolean;
  /** Open a finding and go to it in the text; null closes the one open. */
  onPick: (key: string | null) => void;
  /** The line a finding sits in, where its page's text holds it. */
  contextOf: (finding: PageFinding) => FindingContext | null;
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
  expanded,
  ignored,
  context,
  onToggle,
}: {
  finding: PageFinding;
  expanded: boolean;
  ignored: boolean;
  context: FindingContext | null;
  onToggle: () => void;
}) {
  return (
    <li data-finding={finding.key} className={cn(expanded && "bg-primary/5")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60",
          expanded && "hover:bg-primary/10",
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
          {!expanded && (
            <span className="truncate font-mono text-xs text-muted-foreground" title={finding.value}>
              {finding.value}
            </span>
          )}
        </span>
        {finding.evidence && !expanded && <EvidenceIcon evidence={finding.evidence} className="mt-0.5 shrink-0" />}
        <ChevronDownIcon
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="px-3 pt-1 pb-3 pl-9">
          <FindingBody finding={finding} context={context} />
        </div>
      )}
    </li>
  );
}

/**
 * Beside the text: everything found in the document, page by page. A finding opens in
 * place, with the line it sits in and a box to ignore it, and the text goes to it. Where
 * the report holds the page's picture, the panel can show that instead.
 */
export function FindingsPanel({
  findings,
  active,
  isIgnored,
  onPick,
  contextOf,
  current,
  page,
  view,
  onView,
}: FindingsPanelProps) {
  const list = useRef<HTMLUListElement>(null);
  const groups = new Map<number | null, PageFinding[]>();
  for (const finding of findings) groups.set(finding.page, [...(groups.get(finding.page) ?? []), finding]);
  // Findings are listed only where there are some; a page's picture alone takes the panel.
  const showing = findings.length === 0 ? "page" : page ? view : "findings";

  // A finding opened from the text is brought into view in the list.
  useEffect(() => {
    if (!active) return;
    list.current?.querySelector(`[data-finding="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  // The list follows the text: reading a page brings that page's findings into view.
  useEffect(() => {
    const container = list.current;
    const group = container?.querySelector<HTMLElement>(`[data-group="${current}"]`);
    if (container && group) container.scrollTo({ top: group.offsetTop, behavior: "smooth" });
  }, [current]);

  return (
    <aside
      aria-label={findings.length > 0 ? "Findings" : "Page"}
      className="hidden min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card xl:flex"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        {page && findings.length > 0 ? (
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
          <span className="text-sm font-medium">{findings.length > 0 ? "Findings" : "Page"}</span>
        )}
      </div>

      {showing === "page" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-2">{page}</div>
      ) : (
        <ul ref={list} className="relative min-h-0 flex-1 overflow-y-auto pb-2">
          {[...groups].map(([number, items]) => (
            <Group key={number ?? "document"} page={number} title={number === null ? "Document" : `Page ${number}`}>
              {items.map((finding) => (
                <FindingItem
                  key={finding.key}
                  finding={finding}
                  expanded={finding.key === active}
                  ignored={isIgnored(finding)}
                  context={finding.key === active ? contextOf(finding) : null}
                  onToggle={() => onPick(finding.key === active ? null : finding.key)}
                />
              ))}
            </Group>
          ))}
        </ul>
      )}
    </aside>
  );
}
