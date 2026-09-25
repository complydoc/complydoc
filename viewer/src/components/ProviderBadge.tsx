import { ProviderLogo } from "@/components/ProviderLogo";
import { Badge } from "@/components/ui/badge";
import { providerColour, providerName } from "@/report/cost";

/**
 * A model provider: its logo in the colour it takes on every chart, on a tint
 * of that colour, so a row in a table reads as the bar it matches.
 */
export function ProviderBadge({ provider }: { provider: string }) {
  const colour = providerColour(provider);
  return (
    <Badge
      variant="outline"
      style={{
        borderColor: `color-mix(in oklab, ${colour} 45%, transparent)`,
        background: `color-mix(in oklab, ${colour} 12%, transparent)`,
      }}
    >
      <span style={{ color: colour }} className="inline-flex">
        <ProviderLogo provider={provider} className="size-3" />
      </span>
      {providerName(provider)}
    </Badge>
  );
}
