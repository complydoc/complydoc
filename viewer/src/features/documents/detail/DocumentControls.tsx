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
            variant={on ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={on}
            disabled={!available}
            onClick={() => onChange(!on)}
            aria-label={on ? "Mask the values" : "Show the values"}
          >
            {on ? <EyeIcon /> : <EyeOffIcon />}
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

/** A way through the findings in order, like the results of a search. */
export function FindingStepper({ at, count, onStep }: { at: number; count: number; onStep: (next: number) => void }) {
  if (count === 0) return <span className="text-sm text-muted-foreground">Nothing found</span>;
  return (
    <span className="flex items-center text-sm text-muted-foreground" role="group" aria-label="Findings">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous finding"
        onClick={() => onStep(at <= 0 ? count - 1 : at - 1)}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="tabular-nums">
        {at < 0 ? `${count} ${count === 1 ? "finding" : "findings"}` : `Finding ${at + 1} of ${count}`}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label="Next finding" onClick={() => onStep((at + 1) % count)}>
        <ChevronRightIcon />
      </Button>
    </span>
  );
}
