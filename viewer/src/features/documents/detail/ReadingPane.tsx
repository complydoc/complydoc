import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiffPart, Reading } from "@/report/readings";
import { DiffText } from "./DiffText";

interface ReadingPaneProps {
  label: string;
  readings: Reading[];
  selected: string;
  onSelect: (id: string) => void;
  parts: DiffPart[];
  side: "left" | "right";
  /** What sits in the badge: "kept", or how much this reading shares with the other. */
  note: string;
}

/** One reading of the page, chosen from every reader the run compared. */
export function ReadingPane({ label, readings, selected, onSelect, parts, side, note }: ReadingPaneProps) {
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <Select value={selected} onValueChange={onSelect}>
          <SelectTrigger size="sm" aria-label={label} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {readings.map((reading) => (
                <SelectItem key={reading.id} value={reading.id}>
                  {reading.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <CardAction>
          <Badge variant="secondary">{note}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <DiffText parts={parts} side={side} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
