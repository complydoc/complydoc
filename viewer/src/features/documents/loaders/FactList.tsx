import { ToneBadge } from "@/components/ToneBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/** Each expected fact, whether each loader kept it, and the nearest passage where it did not. */
interface FactListProps {
  facts: FactCheck[];
  /** Loader names in the order to list them, best first. */
  loaders: string[];
}

export function FactList({ facts, loaders }: FactListProps) {
  return (
    <div className="flex flex-col gap-4">
      {facts.map((check) => (
        <Card key={check.fact}>
          <CardHeader>
            <CardTitle>“{check.fact}”</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              {loaders.map((loader) => {
                const match = matchOf(check.found[loader] ?? null);
                const nearest = check.nearest[loader];
                return (
                  <div key={loader} className="grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-1">
                    <dt className="text-muted-foreground">{loader}</dt>
                    <dd className="flex items-center gap-2">
                      <ToneBadge tone={match.tone}>{match.label}</ToneBadge>
                      <span className="text-xs text-faint">{formatPercent(check.scores[loader] ?? 0)}</span>
                    </dd>
                    {nearest && <dd className="col-start-2 font-mono text-xs text-muted-foreground">“{nearest}”</dd>}
                  </div>
                );
              })}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
