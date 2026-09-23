import { CircleCheckIcon, CircleHelpIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { LoaderComparison } from "@/report/types";

/** Which loader to use, or why the run cannot tell. */
export function Verdict({ comparison }: { comparison: LoaderComparison }) {
  const { recommended, verdict } = comparison;
  return (
    <Alert role="status" className={recommended ? "border-success/40 bg-success-soft" : undefined}>
      {recommended ? <CircleCheckIcon className="text-success" /> : <CircleHelpIcon />}
      <AlertTitle className="text-base">{recommended ? `Use ${recommended}` : "No clear pick"}</AlertTitle>
      <AlertDescription>{verdict}</AlertDescription>
    </Alert>
  );
}
