import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PagerProps {
  label: string;
  first: number;
  size: number;
  matching: number;
  page: number;
  pages: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
}

/** Where a long table is, and the way to the page before or after. */
export function Pager({ label, first, size, matching, page, pages, onPrevious, onNext }: PagerProps) {
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>
        {first + 1}–{Math.min(first + size, matching)} of {matching}
      </span>
      <span className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          onClick={onPrevious ?? undefined}
          disabled={!onPrevious}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          onClick={onNext ?? undefined}
          disabled={!onNext}
        >
          <ChevronRightIcon />
        </Button>
      </span>
    </nav>
  );
}
