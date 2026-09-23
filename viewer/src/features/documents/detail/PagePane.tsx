import { Maximize2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { plural } from "@/report/format";
import type { PagePreview } from "@/report/types";
import { PagePicture } from "./PagePicture";

interface PagePaneProps {
  number: number;
  preview: PagePreview | undefined;
  /** The document's name, for the enlarged view's title. */
  name: string;
}

/** The page, on a card shaped like the reading panes beside it, and enlarged on request to read it. */
export function PagePane({ number, preview, name }: PagePaneProps) {
  const found = preview?.sensitive.length ?? 0;
  const identifiers = found > 0 && <Badge variant="destructive">{plural(found, "identifier")}</Badge>;

  return (
    <Card size="sm" className="h-full">
      <CardHeader className="items-center">
        <CardTitle className="flex h-7 items-center">Page {number}</CardTitle>
        <CardAction className="flex items-center gap-2">
          {identifiers}
          {preview && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Enlarge page ${number}`}>
                  <Maximize2Icon />
                </Button>
              </DialogTrigger>
              <DialogContent
                className="flex h-[92svh] flex-col sm:max-w-[min(92vw,72rem)]"
                // Focusing the first identifier box would open its tooltip over the page.
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                <DialogHeader>
                  <DialogTitle>
                    {name}, page {number}
                  </DialogTitle>
                  <DialogDescription>Every identifier found is boxed where it sits.</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1">
                  <PagePicture preview={preview} />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <PagePicture preview={preview} />
      </CardContent>
    </Card>
  );
}
