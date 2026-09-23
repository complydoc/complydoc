import { ToneBadge } from "@/components/ToneBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatPercent } from "@/report/format";
import type { FactCheck, FactMatch } from "@/report/types";

const MATCH = {
  exact: { label: "kept", tone: "good" },
  close: { label: "close", tone: "warn" },
  missed: { label: "missed", tone: "bad" },
} as const;

function matchOf(found: FactMatch) {
  return MATCH[found ?? "missed"];
}

interface FactListProps {
  facts: FactCheck[];
  /** Loader names in the order to list them, best first. */
  loaders: string[];
}

/** Each expected fact, whether each loader kept it, and the nearest passage where it did not. */
export function FactList({ facts, loaders }: FactListProps) {
  return (
    <div className="flex flex-col gap-4">
      {facts.map((check) => (
        <Card key={check.fact}>
          <CardHeader>
            <CardTitle>“{check.fact}”</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemGroup aria-label="Loaders">
              {loaders.map((loader) => {
                const match = matchOf(check.found[loader] ?? null);
                const nearest = check.nearest[loader];
                return (
                  <Item key={loader} role="listitem" size="xs" variant="muted">
                    <ItemContent>
                      <ItemTitle>{loader}</ItemTitle>
                      {nearest && <ItemDescription className="font-mono text-xs">“{nearest}”</ItemDescription>}
                    </ItemContent>
                    <ItemActions>
                      <span className="text-xs text-faint">{formatPercent(check.scores[loader] ?? 0)}</span>
                      <ToneBadge tone={match.tone}>{match.label}</ToneBadge>
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
