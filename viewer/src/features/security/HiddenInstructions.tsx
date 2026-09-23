import { EyeOffIcon } from "lucide-react";
import { ToneBadge } from "@/components/ToneBadge";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { fileName } from "@/report/format";
import { documentHref } from "@/report/route";
import type { HiddenInstruction } from "@/report/security";
import { severityTone } from "@/report/select";

/** Each passage written for a model and hidden from a person: where, what it says, and why it was flagged. */
export function HiddenInstructions({ found }: { found: HiddenInstruction[] }) {
  return (
    <ItemGroup aria-label="Hidden instructions">
      {found.map((finding) => (
        <Item key={finding.id} role="listitem" variant="outline" className="bg-card">
          <ItemMedia variant="icon">
            <EyeOffIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              <a
                href={documentHref(finding.document, finding.page, { kind: "hidden", index: finding.finding })}
                className="underline-offset-4 hover:underline"
              >
                {fileName(finding.path)}
              </a>
              {finding.page !== null && <span className="text-muted-foreground">page {finding.page}</span>}
            </ItemTitle>
            <ItemDescription className="line-clamp-none">“{finding.excerpt}”</ItemDescription>
          </ItemContent>
          <ItemActions>
            <ToneBadge tone={severityTone(finding.severity)}>{finding.severity}</ToneBadge>
          </ItemActions>
          <ItemFooter className="flex-wrap justify-start gap-1.5">
            {finding.hiddenBy.map((reason) => (
              <Badge key={reason} variant="destructive">
                {reason}
              </Badge>
            ))}
            {finding.reasons.map((reason) => (
              <Badge key={reason} variant="outline">
                {reason}
              </Badge>
            ))}
          </ItemFooter>
        </Item>
      ))}
    </ItemGroup>
  );
}
