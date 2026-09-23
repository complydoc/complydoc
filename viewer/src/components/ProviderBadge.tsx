import { Badge } from "@/components/ui/badge";
import { providerColour, providerName } from "@/report/cost";

/** A model provider, with the colour it takes on every chart. */
export function ProviderBadge({ provider }: { provider: string }) {
  return (
    <Badge variant="outline">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: providerColour(provider) }} />
      {providerName(provider)}
    </Badge>
  );
}
