import { useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OpenReport } from "@/features/open/OpenReport";
import { SAMPLES } from "@/features/open/samples";
import { embeddedReport, useReportFile } from "@/hooks/useReportFile";
import { useTheme } from "@/hooks/useTheme";
import { ReportView } from "./ReportView";

/** Shows the opened report, or the way to open one. */
export function App() {
  const { dark, toggle } = useTheme();
  const { state, openFile, openText, close } = useReportFile(embeddedReport);

  const openSample = useCallback(
    async (id: string) => {
      const sample = SAMPLES.find((s) => s.id === id);
      if (sample) openText(`sample: ${sample.label}`, await sample.load());
    },
    [openText],
  );

  return (
    <TooltipProvider>
      {state.status === "ready" ? (
        <ReportView report={state.report} name={state.name} dark={dark} onToggleTheme={toggle} onClose={close} />
      ) : (
        <OpenReport
          dark={dark}
          onToggleTheme={toggle}
          onFile={openFile}
          onSample={openSample}
          error={state.status === "error" ? `${state.name}: ${state.message}` : undefined}
        />
      )}
    </TooltipProvider>
  );
}
