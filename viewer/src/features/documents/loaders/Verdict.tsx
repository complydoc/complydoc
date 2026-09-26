import { CircleCheckIcon, CircleHelpIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { LoaderComparison } from "@/report/types";

/** Which loader to use, or why the run cannot tell. */
export function Verdict({ comparison }: { comparison: LoaderComparison }) {
  const { recommended, verdict } = comparison;
  const byType = !recommended && (comparison.formats?.some((type) => type.loaders.length > 0) ?? false) && (comparison.formats?.length ?? 0) > 1;
  return (
    <Alert role="status" className={recommended ? "border-success/40 bg-success-soft" : undefined}>
      {recommended ? <CircleCheckIcon className="text-success" /> : <CircleHelpIcon />}
      <AlertTitle className="text-base">{recommended ? `Use ${recommended}` : byType ? "A loader per file type" : "No clear pick"}</AlertTitle>
      <AlertDescription>{verdict}</AlertDescription>
    </Alert>
  );
}
