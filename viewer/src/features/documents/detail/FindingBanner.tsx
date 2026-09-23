import { CrosshairIcon, XIcon } from "lucide-react";
import { ToneBadge } from "@/components/ToneBadge";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Highlight } from "@/report/highlight";
import { evidenceLabel, severityTone } from "@/report/select";

interface FindingBannerProps {
  highlight: Highlight;
  /** Where to go to stop showing it: the same page without the finding. */
  clearHref: string;
}

/** Which finding is shown on the page below, and a way to put it away. */
export function FindingBanner({ highlight, clearHref }: FindingBannerProps) {
  return (
    <Alert className="border-primary/40">
      <CrosshairIcon className="text-primary" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {highlight.label}
        {highlight.page !== null && <span className="font-normal text-muted-foreground">page {highlight.page}</span>}
        <ToneBadge tone={severityTone(highlight.severity)}>{highlight.severity}</ToneBadge>
        {highlight.evidence && <Badge variant="outline">{evidenceLabel(highlight.evidence)}</Badge>}
      </AlertTitle>
      <AlertDescription>
        <code className="font-mono">{highlight.kind === "identifier" ? highlight.needle : `${highlight.needle}…`}</code>
      </AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={clearHref} aria-label="Stop showing this finding">
            <XIcon />
          </a>
        </Button>
      </AlertAction>
    </Alert>
  );
}
