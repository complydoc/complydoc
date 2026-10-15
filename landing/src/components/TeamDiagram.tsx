import { ArrowDownIcon, FolderIcon, LockKeyholeIcon, MonitorIcon, WorkflowIcon, type LucideIcon } from "lucide-react";

const STEPS: { icon: LucideIcon; title: string; detail: string }[] = [
  { icon: WorkflowIcon, title: "Your pipelines and CI jobs", detail: "write a report for each run" },
  { icon: FolderIcon, title: "A shared folder or a bucket", detail: "the only state there is" },
  { icon: MonitorIcon, title: "The viewer, in a container", detail: "read-only, changes no file" },
  { icon: LockKeyholeIcon, title: "Your own sign-in", detail: "the proxy is all that is published" },
];

/** How a team shares the reports: who writes them, where they live, and what serves them. */
export function TeamDiagram() {
  return (
    <ol className="flex flex-col items-stretch gap-2">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex flex-col items-center gap-2">
          {i > 0 && <ArrowDownIcon aria-hidden className="size-4 text-muted-foreground" />}
          <div className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
            <step.icon className="size-5 shrink-0 text-primary" />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{step.title}</span>
              <span className="text-sm text-muted-foreground">{step.detail}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
