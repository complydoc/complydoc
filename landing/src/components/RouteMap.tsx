import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Route, RoutedPage } from "@/data/routing";
import { cn } from "@/lib/utils";

const ROUTE_STYLE: Record<Route, { label: string; tile: string }> = {
  text: { label: "Text layer", tile: "bg-secondary border-border" },
  ocr: { label: "Local OCR", tile: "bg-chart-5/25 border-chart-5/50" },
  vision: { label: "Vision model", tile: "bg-warning-soft border-warning" },
};

interface RouteMapProps {
  documents: { document: string; pages: RoutedPage[] }[];
  className?: string;
}

/** Every page of every document as a tile, coloured by the route it needs, with the reason on hover. */
export function RouteMap({ documents, className }: RouteMapProps) {
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {documents.map((doc) => (
        <li key={doc.document} className="grid items-center gap-2 sm:grid-cols-[15rem_1fr]">
          <span className="truncate font-mono text-xs text-muted-foreground">{doc.document}</span>
          <span className="flex flex-wrap gap-1.5">
            {doc.pages.map((page) => (
              <Tooltip key={page.page}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${doc.document} page ${page.page}: ${ROUTE_STYLE[page.route].label}, ${page.reason}`}
                    className={cn(
                      "flex h-9 w-7 items-end justify-center rounded-sm border pb-0.5 font-mono text-[10px] text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      ROUTE_STYLE[page.route].tile,
                    )}
                  >
                    {page.page}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  <p className="font-medium">
                    Page {page.page} · {ROUTE_STYLE[page.route].label}
                  </p>
                  <p>{page.reason}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What each tile colour means. */
export function RouteLegend() {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {(Object.keys(ROUTE_STYLE) as Route[]).map((route) => (
        <li key={route} className="flex items-center gap-2">
          <span className={cn("size-3 rounded-[3px] border", ROUTE_STYLE[route].tile)} />
          {ROUTE_STYLE[route].label}
        </li>
      ))}
    </ul>
  );
}
