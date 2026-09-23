import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { plural } from "@/report/format";
import type { PagePreview } from "@/report/types";
import { PagePicture } from "./PagePicture";

/** The page, on a card shaped like the reading panes beside it. */
export function PagePane({ number, preview }: { number: number; preview: PagePreview | undefined }) {
  const found = preview?.sensitive.length ?? 0;
  return (
    <Card size="sm" className="h-full">
      <CardHeader className="items-center">
        <CardTitle className="flex h-7 items-center">Page {number}</CardTitle>
        {found > 0 && (
          <CardAction>
            <Badge variant="destructive">{plural(found, "identifier")}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <PagePicture preview={preview} />
      </CardContent>
    </Card>
  );
}
