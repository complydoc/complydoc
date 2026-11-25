import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Keys } from "@/components/Keys";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount } from "@/report/format";
import { documentHref } from "@/report/route";

const go = (index: number | null) => {
  if (index !== null) window.location.assign(documentHref(index));
};

function Step({ to, label, keys, children }: { to: number | null; label: string; keys: string[]; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={to === null ? 0 : -1}>
          <Button variant="ghost" size="icon-sm" aria-label={label} disabled={to === null} onClick={() => go(to)}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        <Keys keys={keys} inverted />
      </TooltipContent>
    </Tooltip>
  );
}

/** Where the document sits in the list, and the arrows to the one before and after. */
export function DocumentStepper({
  previous,
  next,
  position,
  total,
}: {
  previous: number | null;
  next: number | null;
  position: number;
  total: number;
}) {
  if (total < 2) return null;
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Documents">
      <span className="px-1 text-xs text-muted-foreground tabular-nums">
        {formatCount(position)} / {formatCount(total)}
      </span>
      <Step to={previous} label="Previous document" keys={["["]}>
        <ChevronUpIcon />
      </Step>
      <Step to={next} label="Next document" keys={["]"]}>
        <ChevronDownIcon />
      </Step>
    </div>
  );
}
