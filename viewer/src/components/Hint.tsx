import type { ReactNode } from "react";
import { Keys } from "@/components/Keys";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A control's name, and its keys when it has some, in a tooltip once the pointer rests on
 * it: Linear's way of teaching its shortcuts where they are used.
 */
export function Hint({ label, keys, children }: { label: string; keys?: string[]; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        {keys && <Keys keys={keys} inverted />}
      </TooltipContent>
    </Tooltip>
  );
}
