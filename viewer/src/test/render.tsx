import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { PlanProvider } from "@/components/PlanProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Report } from "@/report/types";

/** The report a page was given, looking through a wrapper around it. */
function reportOf(ui: ReactElement): Report {
  const props = ui.props as { report?: Report; children?: ReactElement };
  if (props.report) return props.report;
  if (props.children) return reportOf(props.children);
  throw new Error("renderPage needs an element with a report prop");
}

/** Render a page of the viewer as the app does: under the loading plan for its report. */
export function renderPage(ui: ReactElement) {
  return render(
    <PlanProvider report={reportOf(ui)}>
      <TooltipProvider>{ui}</TooltipProvider>
    </PlanProvider>,
  );
}
