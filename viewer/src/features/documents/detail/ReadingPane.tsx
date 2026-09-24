import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { costBasis, costLabel, type DiffPart, type Reading } from "@/report/readings";
import type { ReadingCost } from "@/report/types";
import { DiffText } from "./DiffText";

interface ReadingPaneProps {
  label: string;
  readings: Reading[];
  selected: string;
  onSelect: (id: string) => void;
  parts: DiffPart[];
  side: "left" | "right";
  /** What sits in the badge: "kept", or how many stretches differ. */
  note: string;
  /** A finding to mark in the text. */
  needle: string | null;
  /** What a vision read of this page would cost, shown where no vision model read it. */
  estimate?: ReadingCost | null;
}

function CostBadge({ cost, prefix = "" }: { cost: ReadingCost; prefix?: string }) {
  const label = costLabel(cost);
  if (!label) return null;
  return (
    <Badge variant="outline" title={costBasis(cost)}>
      {prefix}
      {label}
    </Badge>
  );
}

/** One reading of the page, chosen from every reader the run compared, or named when it is the only one. */
export function ReadingPane({ label, readings, selected, onSelect, parts, side, note, needle, estimate }: ReadingPaneProps) {
  const current = readings.find((reading) => reading.id === selected) ?? readings[0];
  return (
    <Card size="sm" className="h-full">
      <CardHeader className="items-center">
        {readings.length > 1 ? (
          <Select value={selected} onValueChange={onSelect}>
            <SelectTrigger size="sm" aria-label={label} className="w-56 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {readings.map((reading) => (
                  <SelectItem key={reading.id} value={reading.id}>
                    {reading.label}
                    {reading.cost && <span className="text-muted-foreground">{costLabel(reading.cost)}</span>}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <CardTitle className="flex h-7 items-center">{readings[0]?.label}</CardTitle>
        )}
        <CardAction className="flex flex-wrap justify-end gap-1">
          <Badge variant="secondary">{note}</Badge>
          {current?.cost && <CostBadge cost={current.cost} />}
          {estimate && <CostBadge cost={estimate} prefix="vision " />}
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <DiffText parts={parts} side={side} needle={needle} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
