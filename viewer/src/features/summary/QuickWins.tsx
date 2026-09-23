import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { plural } from "@/report/format";
import type { QuickWin } from "@/report/types";

/** What to do first, each with who does it and how many documents it touches. */
export function QuickWins({ wins }: { wins: QuickWin[] }) {
  if (wins.length === 0) return <p className="text-muted-foreground">Nothing to fix first.</p>;
  return (
    <Card className="py-0">
      <ol className="divide-y">
        {wins.map((win) => (
          <li key={win.id} className="flex items-center gap-3 px-4 py-3">
            <Badge variant="outline">{win.actor}</Badge>
            <span className="flex-1">{win.title}</span>
            <span className="text-sm whitespace-nowrap text-muted-foreground">
              {plural(win.documents.length, "document")}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
