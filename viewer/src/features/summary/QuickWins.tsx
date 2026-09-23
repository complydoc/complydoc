import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { plural } from "@/report/format";
import type { QuickWin } from "@/report/types";

/** What to do first, each with who does it and how many documents it touches. */
export function QuickWins({ wins }: { wins: QuickWin[] }) {
  if (wins.length === 0) return <p className="text-muted-foreground">Nothing to fix first.</p>;
  return (
    <ItemGroup aria-label="Quick wins">
      {wins.map((win) => (
        <Item key={win.id} role="listitem" variant="outline" className="bg-card">
          <ItemMedia>
            <Badge variant="outline">{win.actor}</Badge>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{win.title}</ItemTitle>
          </ItemContent>
          <ItemActions className="text-muted-foreground">{plural(win.documents.length, "document")}</ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
