import { BookOpenTextIcon, ChevronDownIcon } from "lucide-react";
import { ModelPicker } from "@/components/ModelPicker";
import { ToolName } from "@/components/ToolLogo";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePlan } from "@/hooks/usePlan";
import type { Method } from "@/report/plan";

/** The methods whose result depends on which loader reads a file's own text. */
const READS_WITH_LOADERS: readonly Method[] = ["loader", "loader_ocr", "router"];

/**
 * How the documents are read, which loader reads each file type, and which
 * models the result goes to: the choice every cost and time in the report is
 * worked out under.
 */
export function PlanBar() {
  const { plan, options, loaderChoices, models, choice, chooseMethod, chooseLoader } = usePlan();
  if (models.length === 0) return null;
  const images = plan.method === "vision" || plan.method === "router";
  const text = plan.method !== "vision";

  const method = options.find((option) => option.id === plan.method);
  const pickers = (
    <>
      <Select value={plan.method} onValueChange={(id) => chooseMethod(id as Method)}>
        <SelectTrigger size="sm" aria-label="How pages are read" className="max-w-56 min-w-0 shrink">
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
      {/* The loader matters only where the plan reads a file's own text. Other file types have one loader each. */}
      {READS_WITH_LOADERS.includes(plan.method) &&
        loaderChoices.map((loaders) => (
          <Select
            key={loaders.format}
            value={plan.loaders[loaders.format] ?? loaders.readers[0] ?? ""}
            onValueChange={(reader) => chooseLoader(loaders.format, reader)}
          >
            <SelectTrigger size="sm" aria-label={`${loaders.label} loader`} className="max-w-48 min-w-0 shrink">
              <span className="text-xs text-muted-foreground">{loaders.label}</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                {loaders.readers.map((reader) => (
                  <SelectItem key={reader} value={reader}>
                    <ToolName name={reader} />
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ))}
      {/* Only the models the pages go to are asked for; the router needs both. */}
      {text && <ModelPicker label="Text model" models={models} value={choice.text} onChange={choice.chooseText} />}
      {images && (
        <ModelPicker label="Vision model" models={models} value={choice.vision} onChange={choice.chooseVision} visionOnly />
      )}
    </>
  );

  return (
    <>
      {/* On a wide window the pickers sit in the bar; on a narrower one they fold into one
          button, rather than each being cut to a few letters. */}
      <div role="group" aria-label="Loading plan" className="hidden min-w-0 items-center gap-2 2xl:flex">
        {pickers}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="min-w-0 2xl:hidden">
            <BookOpenTextIcon className="text-muted-foreground" />
            <span className="truncate">{method?.label ?? "Loading plan"}</span>
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex w-80 flex-col items-stretch gap-2 [&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:max-w-none [&_button]:max-w-none"
        >
          <span className="caps">Loading plan</span>
          {pickers}
        </PopoverContent>
      </Popover>
    </>
  );
}
