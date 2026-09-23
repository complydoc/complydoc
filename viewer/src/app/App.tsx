import { useCallback } from "react";
import { OpenReport } from "@/features/open/OpenReport";
import { embeddedReport, useReportFile } from "@/hooks/useReportFile";
import { useTheme } from "@/hooks/useTheme";
import { ReportView } from "./ReportView";

/** Shows the opened report, or the way to open one. */
export function App() {
  const { theme, setTheme } = useTheme();
  const { state, openFile, openText, close } = useReportFile(embeddedReport);

  // The sample is loaded on demand, so it is not in the bundle a real report opens with.
  const openSample = useCallback(async () => {
    const { default: text } = await import("@/fixtures/report.json?raw");
    openText("sample: pypdf vs pdfplumber", text);
  }, [openText]);

  if (state.status === "ready") {
    return <ReportView report={state.report} name={state.name} theme={theme} onTheme={setTheme} onClose={close} />;
  }
  return (
    <OpenReport
      onFile={openFile}
      onSample={openSample}
      error={state.status === "error" ? `${state.name}: ${state.message}` : undefined}
    />
  );
}
