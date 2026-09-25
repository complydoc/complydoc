import { CoinsIcon } from "lucide-react";
import { useState } from "react";
import { BarList } from "@/components/BarList";
import { ProviderBadge } from "@/components/ProviderBadge";
import { Section, SectionStack } from "@/components/Section";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PATHS, UNITS, byProvider, costRows, pricedOn, providerColour, providerName, providersOf, type CostUnit } from "@/report/cost";
import { formatUsd } from "@/report/format";
import type { CostPath, Report } from "@/report/types";
import { CostTable } from "./CostTable";
import { PlanComparison } from "./PlanComparison";

const ALL = "all";

/** What sending the folder to a model costs: the cheapest each way, every model by provider, and a table of them. */
export function CostPage({ report }: { report: Report }) {
  const paths = PATHS.filter((path) => pricedOn(report, path.key).length > 0);
  const [path, setPath] = useState<CostPath>(paths[0]?.key ?? "text_ocr");
  const [unit, setUnit] = useState<CostUnit>("per_1000");
  const [provider, setProvider] = useState<string>(ALL);

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

  const models = byProvider(report, path, unit, provider === ALL ? null : provider);
  const providers = providersOf(pricedOn(report, path, unit));
  const series = {
    usd: { label: UNITS.find((u) => u.key === unit)?.label ?? "", color: "var(--primary)" },
  } satisfies ChartConfig;

  return (
    <SectionStack>
      <Section title="Ways to read this folder">
        <PlanComparison report={report} />
      </Section>

      <Section title="By provider">
        <Card>
          <CardHeader>
            <CardTitle>{provider === ALL ? "Every model, by provider" : providerName(provider)}</CardTitle>
            <CardAction>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger size="sm" className="w-44" aria-label="Provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={ALL}>All providers</SelectItem>
                    {providers.map((id) => (
                      <SelectItem key={id} value={id}>
                        {providerName(id)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
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
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={unit}
                aria-label="What the cost is for"
                onValueChange={(value) => value && setUnit(value as CostUnit)}
                className="ml-auto"
              >
                {UNITS.map((option) => (
                  <ToggleGroupItem key={option.key} value={option.key}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <BarList
              series={series}
              data={models}
              category="name"
              format={formatUsd}
              colour={(model) => providerColour(model.provider)}
              logo={(model) => model.provider}
              onSelect={(model) => setProvider(provider === ALL ? model.provider : ALL)}
            />
          </CardContent>
          <CardFooter className="flex-wrap gap-2 border-t-0 bg-transparent">
            {providersOf(models).map((id) => (
              <ProviderBadge key={id} provider={id} />
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
