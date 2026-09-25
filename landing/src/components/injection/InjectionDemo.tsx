import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KIND_LABEL, PASSAGES, type Kind } from "@/data/injection";
import { DocumentPreview } from "./DocumentPreview";
import { Pipeline } from "./Pipeline";

/** complydoc's threshold for Jev, measured in docs/explanation/accuracy.md. */
const DEFAULT_THRESHOLD = 0.5;

const KINDS: Kind[] = ["plain", "oblique", "decoy"];

function reported(threshold: number) {
  return (p: (typeof PASSAGES)[number]) => p.patterns.length > 0 || p.score >= threshold;
}

/** Pick a passage, hide it in a page, and follow it through the patterns and the System One model. */
export function InjectionDemo() {
  const [selected, setSelected] = useState(PASSAGES[3]?.id ?? "");
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const passage = PASSAGES.find((p) => p.id === selected) ?? PASSAGES[0];
  const isReported = reported(threshold);
  const instructions = PASSAGES.filter((p) => p.kind !== "decoy");
  const decoys = PASSAGES.filter((p) => p.kind === "decoy");

  if (!passage) return null;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid gap-0 px-0 *:min-w-0 lg:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-5 border-b p-5 lg:border-r lg:border-b-0">
          <p className="text-sm font-medium">Choose a passage</p>
          <ToggleGroup
            type="single"
            orientation="vertical"
            spacing={1}
            value={selected}
            onValueChange={(value) => value && setSelected(value)}
            className="w-full"
          >
            {KINDS.map((kind) => (
              <div key={kind} className="flex flex-col gap-1 pb-3">
                <p className="px-2 pb-1 text-xs text-muted-foreground">{KIND_LABEL[kind]}</p>
                {PASSAGES.filter((p) => p.kind === kind).map((p) => (
                  <ToggleGroupItem
                    key={p.id}
                    value={p.id}
                    className="h-auto w-full justify-start px-2 py-1.5 text-left text-sm whitespace-normal"
                  >
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </div>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <DocumentPreview passage={passage.text} />
          <Pipeline passage={passage} threshold={threshold} />
          <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-medium">Threshold</span>
              <span className="font-mono">{threshold.toFixed(2)}</span>
            </div>
            <Slider
              min={0.01}
              max={0.99}
              step={0.01}
              value={[threshold]}
              onValueChange={([value]) => value !== undefined && setThreshold(value)}
              aria-label="Threshold"
            />
            <p className="text-sm text-muted-foreground">
              At {threshold.toFixed(2)}: {instructions.filter(isReported).length} of {instructions.length} instructions
              reported, {decoys.filter(isReported).length} of {decoys.length} decoys flagged. complydoc uses 0.50 for
              this model.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
