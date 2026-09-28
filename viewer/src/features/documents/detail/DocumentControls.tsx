import { EyeIcon, EyeOffIcon, ScissorsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChunkLayer } from "@/report/chunkPlaces";
import { splitterName } from "@/report/chunkView";

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

/**
 * Which splitter's chunks to draw over the text, from the folder's chunks run; none by
 * default. Shown only where that run chunked this document.
 */
export function ChunkPicker({
  layers,
  value,
  onChange,
}: {
  layers: ChunkLayer[];
  value: string | null;
  onChange: (splitter: string | null) => void;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
      <SelectTrigger size="sm" aria-label="Chunks" className="max-w-64 min-w-0">
        <ScissorsIcon className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={NONE}>No chunks</SelectItem>
        {layers.map((layer) => (
          <SelectItem key={layer.splitter} value={layer.splitter} title={layer.splitter}>
            {splitterName(layer.splitter).settings.join(" · ") || layer.splitter}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const NONE = "__none__";

/** For a document read more than one way: its text, with what was found, or the diff of two readings. */
export function ModeToggle({ value, onChange }: { value: "text" | "diff"; onChange: (mode: "text" | "diff") => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(next) => next && onChange(next as "text" | "diff")}
      aria-label="Show"
    >
      <ToggleGroupItem value="text">Text</ToggleGroupItem>
      <ToggleGroupItem value="diff">Diff</ToggleGroupItem>
    </ToggleGroup>
  );
}
