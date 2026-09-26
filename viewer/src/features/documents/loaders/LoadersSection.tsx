import type { ReactNode } from "react";
import { Section } from "@/components/Section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { returnedBySomeOnly } from "@/report/select";
import type { LoaderComparison } from "@/report/types";
import { FactList } from "./FactList";
import { FormatTable } from "./FormatTable";
import { LoaderTable } from "./LoaderTable";
import { DifferenceList, ReturnedList } from "./OnlySomeList";
import { Verdict } from "./Verdict";

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Which loader to use and the evidence for it: the verdict, the loaders side
 * by side, then a card for each kind of evidence the run has, in equal columns.
 */
export function LoadersSection({ comparison }: { comparison: LoaderComparison }) {
  const returned = returnedBySomeOnly(comparison);
  const differences = comparison.identifier_differences;

  const panels = [
    comparison.facts.length > 0 && (
      <Panel key="facts" title="Expected facts">
        <FactList facts={comparison.facts} loaders={comparison.ranked} />
      </Panel>
    ),
    differences.length > 0 && (
      <Panel key="identifiers" title="Identifiers only some kept" description="Green kept it, red lost it">
        <DifferenceList rows={differences} />
      </Panel>
    ),
    returned.length > 0 && (
      <Panel key="returned" title="Returned by some only">
        <ReturnedList rows={returned} />
      </Panel>
    ),
  ].filter(Boolean);

  return (
    <Section title="Loaders">
      <div className="flex flex-col gap-4">
        <Verdict comparison={comparison} />
        <LoaderTable comparison={comparison} />
        {(comparison.formats?.length ?? 0) > 1 && <FormatTable comparison={comparison} />}
        {panels.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{panels}</div>}
      </div>
    </Section>
  );
}
