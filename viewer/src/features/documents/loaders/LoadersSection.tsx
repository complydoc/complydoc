import type { ReactNode } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { Section } from "@/components/Section";
import { humanise } from "@/report/format";
import { returnedBySomeOnly, type OnlySome } from "@/report/select";
import type { IdentifierDifference, LoaderComparison } from "@/report/types";
import { FactList } from "./FactList";
import { LoaderTable } from "./LoaderTable";
import { Verdict } from "./Verdict";

const differenceColumns: Column<IdentifierDifference>[] = [
  { header: "Identifier", cell: (row) => humanise(row.category) },
  { header: "Value", cell: (row) => <code className="font-mono">{row.value}</code> },
  { header: "Where", cell: (row) => row.location },
  { header: "Kept by", cell: (row) => row.found_by.join(", ") },
  { header: "Lost by", cell: (row) => row.missed_by.join(", ") },
];

const onlySomeColumns: Column<OnlySome>[] = [
  { header: "Kind", cell: (row) => row.kind },
  { header: "Name", cell: (row) => <code className="font-mono">{row.name}</code> },
  { header: "Returned by", cell: (row) => row.loaders.join(", ") },
];

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-heading font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** Which loader to use and the evidence for it. Each part shows only when it has something to say. */
export function LoadersSection({ comparison }: { comparison: LoaderComparison }) {
  const onlySome = returnedBySomeOnly(comparison);
  const differences = comparison.identifier_differences;

  return (
    <Section title="Loaders" aside={`${comparison.loaders.length} compared`}>
      <div className="flex flex-col gap-8">
        <Verdict comparison={comparison} />
        <LoaderTable comparison={comparison} />

        {comparison.facts.length > 0 && (
          <Part title="Expected facts">
            <FactList facts={comparison.facts} loaders={comparison.ranked} />
          </Part>
        )}

        {differences.length > 0 && (
          <Part title="Identifiers only some loaders kept">
            <DataTable
              caption="Identifiers only some loaders kept"
              columns={differenceColumns}
              rows={differences}
              rowKey={(row) => `${row.location}-${row.category}-${row.value}`}
            />
          </Part>
        )}

        {onlySome.length > 0 && (
          <Part title="Returned by some loaders only">
            <DataTable
              caption="Returned by some loaders only"
              columns={onlySomeColumns}
              rows={onlySome}
              rowKey={(row) => `${row.kind}-${row.name}`}
            />
          </Part>
        )}
      </div>
    </Section>
  );
}
