import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { NotInRun } from "@/components/NotInRun";
import { Section, SectionStack } from "@/components/Section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDate, formatSeconds, plural } from "@/report/format";
import { measured } from "@/report/measured";
import { sendingStep, stepsOf } from "@/report/traceView";
import type { Report } from "@/report/types";
import { Sent } from "./Sent";
import { StepDetail } from "./StepDetail";
import { StepFlow } from "./StepFlow";
import { ValueTrail } from "./ValueTrail";

/**
 * An ingestion pipeline observed with `cd.observe`, step by step: what left the machine,
 * the steps left to right with what changed between them, the step picked in detail, and
 * where each identifier went along the way.
 */
export function PipelinePage({ report }: { report: Report }) {
  const trace = report.trace;
  const steps = trace ? stepsOf(trace) : [];
  const sending = sendingStep(steps);
  const [selected, setSelected] = useState(() => sending?.index ?? Math.max(0, steps.length - 1));
  if (!trace || !measured(report, "trace")) return <NotInRun report={report} content="trace" />;
  const step = steps[selected] ?? steps[0];
  if (!step) return null;

  return (
    <SectionStack>
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{trace.name}</h1>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatDate(report.run.started_at)} · {plural(steps.length, "step")} in {formatSeconds(trace.seconds)} ·
            observing took {formatSeconds(trace.overhead_seconds)}
          </span>
        </header>
        {trace.error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>The pipeline raised {trace.error}</AlertTitle>
            <AlertDescription>The steps below end where it stopped.</AlertDescription>
          </Alert>
        )}
        {sending && <Sent step={sending} />}
      </div>

      <Section title="Steps">
        <StepFlow steps={steps} selected={step.index} onSelect={setSelected} />
        <StepDetail step={step} />
      </Section>

      <Section title="Where each identifier went" aside="● there · ○ not there · not looked for">
        <ValueTrail steps={steps} selected={step.index} />
      </Section>
    </SectionStack>
  );
}
