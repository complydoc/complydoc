import { ReadinessChart } from "@/components/ReadinessChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { formatScore } from "@/report/format";
import { bandCounts, bandTone } from "@/report/select";
import type { Report } from "@/report/types";

/** The folder's score, the bands its documents fall in, and the factors behind it. */
export function ReadinessCard({ report }: { report: Report }) {
  const { overall } = report;

  return (
    <Card>
      <CardContent className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <ReadinessChart
          score={formatScore(overall.score)}
          value={overall.score}
          tone={bandTone(overall.label)}
          caption={overall.label ?? "not scored"}
          bands={bandCounts(report)}
        />

        <ItemGroup aria-label="Factors">
          {overall.factors.map((factor) => (
            <Item key={factor.key} role="listitem" size="sm">
              <ItemContent>
                <ItemTitle>
                  {factor.name}
                  <Badge variant="outline">{Math.round(factor.weight * 100)}%</Badge>
                </ItemTitle>
                <ItemDescription>{factor.why}</ItemDescription>
              </ItemContent>
              <ItemActions className="text-base font-semibold">{formatScore(factor.score)}</ItemActions>
              <ItemFooter>
                <Progress value={factor.score ?? 0} aria-label={`${factor.name} score`} />
              </ItemFooter>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
