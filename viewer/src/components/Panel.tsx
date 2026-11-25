import type { ReactNode } from "react";
import { cn } from "cn";

interface PanelProps {
  title: string;
  /** A short line beside the title, saying what the panel shows. */
  description?: string;
  /** A link or control at the header's end, such as where to see it all. */
  action?: ReactNode;
  className?: string;
  /** Classes for the body, such as no padding for a list that runs edge to edge. */
  bodyClassName?: string;
  children: ReactNode;
}

/** One block of a dashboard: a hairline frame, a header strip naming it, and its content. */
export function Panel({ title, description, action, className, bodyClassName, children }: PanelProps) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card", className)}>
      <header className="flex min-h-10 items-center gap-3 border-b bg-panel-header px-4 py-2">
        <h2 className="shrink-0 text-[0.8125rem] font-semibold">{title}</h2>
        {description && <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{description}</p>}
        {action && <div className="ml-auto shrink-0 text-xs">{action}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
