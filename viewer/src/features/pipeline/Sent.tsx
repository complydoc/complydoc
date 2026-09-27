import { CircleCheckIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCount, plural } from "@/report/format";
import type { Step } from "@/report/traceView";

/** What left the machine: the step that reached a host, what it sent there, and what that held. */
export function Sent({ step }: { step: Step }) {
  const what = step.kind === "embed" ? plural(step.documentsIn ?? 0, "text") : "what it was given";
  const high = step.identifiers.filter((i) => i.severity === "high").length;
  const clean = step.scanned !== "off" && step.identifiers.length === 0;
  return (
    <Alert
      role="status"
      className={
        clean
          ? "border-success/40 bg-success-soft"
          : step.identifiers.length
            ? "border-destructive/40 bg-destructive-soft"
            : undefined
      }
    >
      {clean ? (
        <CircleCheckIcon className="text-success" />
      ) : step.identifiers.length ? (
        <TriangleAlertIcon className="text-destructive" />
      ) : (
        <SendIcon />
      )}
      <AlertTitle className="text-base">
        {step.component} sent {what} to {step.hosts.join(", ")}
      </AlertTitle>
      <AlertDescription>
        {step.scanned === "off"
          ? "What it sent was not scanned."
          : clean
            ? "None of them held an identifier complydoc looks for."
            : `They held ${plural(step.identifiers.length, "identifier")}${high ? `, ${formatCount(high)} of them high severity` : ""}. The table below shows where each came from.`}
      </AlertDescription>
    </Alert>
  );
}
