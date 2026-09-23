import type { ReactNode } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, type Columns } from "@/components/DataTable";
import { Section } from "@/components/Section";
import { humanise } from "@/report/format";
import { returnedBySomeOnly, type OnlySome } from "@/report/select";
import type { IdentifierDifference, LoaderComparison } from "@/report/types";
import { FactList } from "./FactList";
import { LoaderTable } from "./LoaderTable";
import { Verdict } from "./Verdict";

const difference = createColumnHelper<IdentifierDifference>();
const differenceColumns: Columns<IdentifierDifference> = [
  difference.accessor((row) => humanise(row.category), { id: "identifier", header: "Identifier" }),
  difference.accessor("value", { header: "Value", cell: (c) => <code className="font-mono">{c.getValue()}</code> }),
  difference.accessor("location", { header: "Where" }),
  difference.accessor((row) => row.found_by.join(", "), { id: "kept", header: "Kept by" }),
  difference.accessor((row) => row.missed_by.join(", "), { id: "lost", header: "Lost by" }),
];

const onlySome = createColumnHelper<OnlySome>();
const onlySomeColumns: Columns<OnlySome> = [
  onlySome.accessor("kind", { header: "Kind" }),
  onlySome.accessor("name", { header: "Name", cell: (c) => <code className="font-mono">{c.getValue()}</code> }),
  onlySome.accessor((row) => row.loaders.join(", "), { id: "returned", header: "Returned by" }),
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
  const returned = returnedBySomeOnly(comparison);
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

        {returned.length > 0 && (
          <Part title="Returned by some loaders only">
            <DataTable
              caption="Returned by some loaders only"
              columns={onlySomeColumns}
              rows={returned}
              rowKey={(row) => `${row.kind}-${row.name}`}
            />
          </Part>
        )}
      </div>
    </Section>
  );
}
