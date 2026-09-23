import { CoinsIcon } from "lucide-react";
import { useState } from "react";
import { BarList } from "@/components/BarList";
import { ProviderBadge } from "@/components/ProviderBadge";
import { Section, SectionStack } from "@/components/Section";
import { Stat, StatGrid } from "@/components/Stat";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PATHS, cheapest, costRows, pricedOn, providerColour, providersOf } from "@/report/cost";
import { formatUsd } from "@/report/format";
import type { CostPath, Report } from "@/report/types";
import { CostTable } from "./CostTable";

const SHOWN = 10;
const SERIES = { usd: { label: "Per 1,000 documents", color: "var(--primary)" } } satisfies ChartConfig;

/** What sending the folder to a model costs: the cheapest each way, the cheapest models, and every model. */
export function CostPage({ report }: { report: Report }) {
  const paths = PATHS.filter((path) => pricedOn(report, path.key).length > 0);
  const [path, setPath] = useState<CostPath>(paths[0]?.key ?? "text_ocr");

  if (paths.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CoinsIcon />
          </EmptyMedia>
          <EmptyTitle>No cost in this report</EmptyTitle>
          <EmptyDescription>Run the audit with cost among its checks to price the folder.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const text = cheapest(report, "text_ocr");
  const images = cheapest(report, "vision");
  const models = pricedOn(report, path).slice(0, SHOWN);

  return (
    <SectionStack>
      <Section title="Per 1,000 documents">
        <StatGrid>
          <Stat label="Cheapest as text" value={formatUsd(text?.usd ?? null)} note={text?.name ?? "no model priced"} />
          <Stat label="Cheapest as images" value={formatUsd(images?.usd ?? null)} note={images?.name ?? "no pictures to price"} />
          <Stat
            label="Images cost"
            value={text && images ? `${Math.round(images.usd / text.usd)}×` : "–"}
            note="what text costs, cheapest each way"
          />
          <Stat label="Models priced" value={report.cost?.models.length ?? 0} note={report.cost?.currency ?? ""} />
        </StatGrid>
      </Section>

      <Section title="Cheapest models">
        <Card>
          <CardHeader>
            <CardTitle>The {models.length} cheapest</CardTitle>
            <CardAction>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={path}
                aria-label="How the documents are sent"
                onValueChange={(value) => value && setPath(value as CostPath)}
              >
                {paths.map((option) => (
                  <ToggleGroupItem key={option.key} value={option.key}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent>
            <BarList
              series={SERIES}
              data={models}
              category="name"
              format={formatUsd}
              colour={(model) => providerColour(model.provider)}
            />
          </CardContent>
          <CardFooter className="flex-wrap gap-2 border-t-0 bg-transparent">
            {providersOf(models).map((provider) => (
              <ProviderBadge key={provider} provider={provider} />
            ))}
          </CardFooter>
        </Card>
      </Section>

      <Section title="Every model">
        <CostTable rows={costRows(report)} />
      </Section>
    </SectionStack>
  );
}
