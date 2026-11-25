import { ShowMore } from "@/components/ShowMore";
import { useShown } from "@/hooks/useShown";
import { EyeOffIcon } from "lucide-react";
import { ToneBadge } from "@/components/ToneBadge";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { fileName } from "@/report/format";
import { documentHref } from "@/report/route";
import type { HiddenInstruction } from "@/report/security";
import { severityTone } from "@/report/select";
import { IgnoreButton } from "./IgnoreButton";

/** Each passage hidden from a person or written for a model: what it is, where, what it says, and why it was flagged. */
export function HiddenInstructions({ found }: { found: HiddenInstruction[] }) {
  const { shown, more, left } = useShown(found);
  return (
    <div className="flex flex-col gap-2">
      <ItemGroup aria-label="Hidden content">
        {shown.map((finding) => (
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
              {/* Inside the content, so the badges line up under the name and the quote, not under the icon. */}
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant={finding.instruction ? "destructive" : "secondary"}>{finding.label}</Badge>
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
              </div>
            </ItemContent>
            <ItemActions className="self-start">
              <ToneBadge tone={severityTone(finding.severity)}>{finding.severity}</ToneBadge>
              <IgnoreButton fingerprint={finding.fingerprint} what="this passage" />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <ShowMore left={left} onMore={more} />
    </div>
  );
}
