import { BookOpenTextIcon } from "lucide-react";
import { ModelPicker } from "@/components/ModelPicker";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePlan } from "@/hooks/usePlan";
import type { ReaderChoice } from "@/report/plan";

/**
 * How the documents are read, and which models the result goes to: the choice
 * every cost and time in the report is worked out under.
 */
export function PlanBar() {
  const { plan, options, models, choice, chooseReader } = usePlan();
  if (models.length === 0) return null;
  const reading = plan.reader === "vision";

  return (
    <div role="group" aria-label="Loading plan" className="flex items-center gap-2">
      <Select value={plan.reader} onValueChange={(id) => chooseReader(id as ReaderChoice)}>
        <SelectTrigger size="sm" aria-label="Reader" className="max-w-56">
          <BookOpenTextIcon className="size-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id} title={option.description}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {/* Only the model the pages actually go to is asked for; routing needs both. */}
      {(!reading || plan.reader === "routed") && (
        <ModelPicker label="Text model" models={models} value={choice.text} onChange={choice.chooseText} />
      )}
      {(reading || plan.reader === "routed") && (
        <ModelPicker label="Vision model" models={models} value={choice.vision} onChange={choice.chooseVision} visionOnly />
      )}
    </div>
  );
}
