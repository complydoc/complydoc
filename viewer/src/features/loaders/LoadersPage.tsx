import { NotInRun } from "@/components/NotInRun";
import { LoadersSection } from "@/features/documents/loaders/LoadersSection";
import type { Report } from "@/report/types";

/** Which loader read these documents best, and the evidence; or, for a run that compared none, how to. */
export function LoadersPage({ report }: { report: Report }) {
  if (!report.loader_comparison) return <NotInRun report={report} content="loaders" />;
  return <LoadersSection comparison={report.loader_comparison} />;
}
