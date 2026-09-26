import { Maximize2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { plural } from "@/report/format";
import type { PagePreview } from "@/report/types";
import { isIgnoredBox, type BoxRef } from "@/report/picture";
import { PagePicture } from "./PagePicture";

interface PagePaneProps {
  number: number;
  preview: PagePreview | undefined;
  /** The document's name, for the enlarged view's title. */
  name: string;
  /** A finding's box to mark on the page. */
  mark: BoxRef | null;
  /** Findings ignored as not a problem: drawn faintly, and left out of the count. */
  ignored?: BoxRef[];
}

/** The page, on a card shaped like the reading panes beside it, and enlarged on request to read it. */
export function PagePane({ number, preview, name, mark, ignored = [] }: PagePaneProps) {
  const found = preview?.sensitive.filter((box) => !isIgnoredBox(box, ignored)).length ?? 0;
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
                  <PagePicture preview={preview} mark={mark} ignored={ignored} />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardAction>
      </CardHeader>
      {/* Tighter than a card's usual padding: every pixel here goes to the page. */}
      <CardContent className="min-h-0 flex-1 px-2">
        <PagePicture preview={preview} mark={mark} ignored={ignored} />
      </CardContent>
    </Card>
  );
}
