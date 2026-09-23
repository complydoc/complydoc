import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Caveat } from "@/report/select";

/** The important things this run could not check, one callout per area. */
export function Caveats({ caveats }: { caveats: Caveat[] }) {
  return (
    <div className="flex flex-col gap-3">
      {caveats.map((caveat) => (
        <Alert key={caveat.area} role="note">
          <TriangleAlertIcon className="text-warning" />
          <AlertTitle>{caveat.area}</AlertTitle>
          <AlertDescription className="text-pretty [&_p:not(:last-child)]:mb-1">
            {caveat.statements.map((statement) => (
              <p key={statement}>{statement}</p>
            ))}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
