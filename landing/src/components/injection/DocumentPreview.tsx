import { useId, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * A page of a made-up vendor questionnaire with the chosen passage hidden in
 * it as white text, the way the sample document hides its instruction.
 */
export function DocumentPreview({ passage }: { passage: string }) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex h-10 items-center justify-between gap-3 border-b bg-muted/40 px-3">
        <span className="truncate font-mono text-xs text-muted-foreground">vendor-questionnaire.pdf · page 2</span>
        <label htmlFor={id} className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          Show hidden text
          <Switch id={id} checked={shown} onCheckedChange={setShown} />
        </label>
      </div>
      <div className="flex flex-col gap-3 bg-card p-5 text-sm leading-6">
        <p className="font-medium">2. Information security</p>
        <p className="text-muted-foreground">
          The vendor holds ISO 27001 certification, renewed in March. Access to customer data is limited to named staff
          and reviewed every quarter.
        </p>
        <p
          className={cn(
            "rounded-sm transition-colors",
            shown ? "bg-destructive-soft px-2 py-1 text-destructive" : "text-card selection:text-foreground",
          )}
        >
          {passage}
        </p>
        <p className="text-muted-foreground">
          Incidents are reported to the customer within 72 hours, and a written review follows within ten working days.
        </p>
      </div>
    </div>
  );
}
