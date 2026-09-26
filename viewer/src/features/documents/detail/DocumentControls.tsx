import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Whether the text shows the values. Only a report written with --reveal holds
 * them; it opens masked all the same, since whoever can see the screen can read them.
 */
export function EyeToggle({
  available,
  on,
  onChange,
}: {
  available: boolean;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button takes no pointer events, so the tooltip hangs on a wrapper. */}
        <span tabIndex={available ? -1 : 0}>
          <Button
            variant={on ? "secondary" : "outline"}
            size="sm"
            aria-pressed={on}
            disabled={!available}
            onClick={() => onChange(!on)}
            aria-label={on ? "Mask the values" : "Show the values"}
          >
            {on ? <EyeIcon /> : <EyeOffIcon />}
            {on ? "Values shown" : "Masked"}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {available
          ? on
            ? "Showing each identifier's value. Mask them again before sharing your screen."
            : "Show each identifier's value. This report holds them because it was written with --reveal."
          : "Values are masked. Audit with --reveal to keep them and show them here."}
      </TooltipContent>
    </Tooltip>
  );
}

/** Which page the text is on, and the pages either side: small enough to sit beside the text's controls. */
export function PageStepper({
  number,
  index,
  count,
  onPick,
}: {
  number: number;
  index: number;
  count: number;
  onPick: (index: number) => void;
}) {
  if (count < 2) return null;
  return (
    <span className="flex items-center text-sm text-muted-foreground" role="group" aria-label="Pages">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous page"
        disabled={index === 0}
        onClick={() => onPick(index - 1)}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="tabular-nums">
        Page {number} of {count}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next page"
        disabled={index === count - 1}
        onClick={() => onPick(index + 1)}
      >
        <ChevronRightIcon />
      </Button>
    </span>
  );
}
