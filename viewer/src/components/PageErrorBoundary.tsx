import { TriangleAlertIcon } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** A part of the viewer that failed to load: after an upgrade, the page open in the tab is the old one. */
function isStaleBuild(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);
}

/**
 * Keeps one page's failure to that page. Without it, an error while drawing a page left
 * the whole viewer blank, sidebar and all, with no way back but to know to reload.
 */
export class PageErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("A viewer page failed to draw", error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isStaleBuild(error);
    return (
      <Empty className="border py-16">
        <EmptyHeader className="max-w-md">
          <EmptyMedia variant="icon">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle className="text-base">
            {stale ? "The viewer was updated" : "This page could not be shown"}
          </EmptyTitle>
          <EmptyDescription>
            {stale
              ? "complydoc was upgraded while this tab was open. Reload to open the reports in the new viewer."
              : `Something in this report was not what the page expected: ${error.message}`}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
}
