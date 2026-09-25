import { Maximize2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  /** How many stretches differ from the other pane; nothing for the reading kept. */
  note?: string | null;
  /** A finding to mark in the text. */
  needle: string | null;
  /** What sending this reading to the chosen model costs, per page. */
  price?: { label: string; title: string } | null;
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
export function ReadingPane({ label, readings, selected, onSelect, parts, side, note, needle, price }: ReadingPaneProps) {
  const current = readings.find((reading) => reading.id === selected) ?? readings[0];
  const text = <DiffText parts={parts} side={side} needle={needle} />;

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
        <CardAction>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Enlarge ${current?.label ?? "reading"}`}>
                <Maximize2Icon />
              </Button>
            </DialogTrigger>
            <DialogContent className="flex h-[92svh] flex-col sm:max-w-[min(92vw,72rem)]">
              <DialogHeader>
                <DialogTitle>{current?.label}</DialogTitle>
                <DialogDescription>
                  {[note, price?.label].filter(Boolean).join(" · ") || "The text this reader took off the page."}
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="min-h-0 flex-1 text-base">{text}</ScrollArea>
            </DialogContent>
          </Dialog>
        </CardAction>
        {/* What making the reading cost sits in the picker; this is what sending it on costs. */}
        {(note || price || (readings.length < 2 && current?.cost)) && (
          <CardDescription className="col-span-full flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
            {note && <Badge variant="secondary">{note}</Badge>}
            {readings.length < 2 && current?.cost && <CostBadge cost={current.cost} prefix="read " />}
            {price && <span title={price.title}>{price.label}</span>}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full">{text}</ScrollArea>
      </CardContent>
    </Card>
  );
}
