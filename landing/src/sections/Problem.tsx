import { CoinsIcon, FileWarningIcon, ShieldAlertIcon, TimerIcon, type LucideIcon } from "lucide-react";
import { Section } from "@/components/Section";
import { Separator } from "@/components/ui/separator";

interface Issue {
  area: string;
  icon: LucideIcon;
  title: string;
  detail: string;
}

const ISSUES: Issue[] = [
  {
    area: "Content",
    icon: FileWarningIcon,
    title: "What each step did to the text",
    detail:
      "Two-column pages read across the columns, tables flattened into lines, sentences cut between chunks. The trace shows it step by step, and the diff shows it line by line.",
  },
  {
    area: "Time",
    icon: TimerIcon,
    title: "Where the time goes",
    detail: "Every call is timed and placed in the run, so the slow loader, the slow file and the slow step stand out.",
  },
  {
    area: "Cost",
    icon: CoinsIcon,
    title: "What the model will cost",
    detail: "Sending every page as an image costs several times more than the text layer, and many pages do not need it.",
  },
  {
    area: "Security",
    icon: ShieldAlertIcon,
    title: "What leaves the machine",
    detail:
      "Each identifier is followed from the loader to the embedding call and the vector store, so you see which ones reached a hosted model or stayed in your index, and can fail CI when one does.",
  },
];

export function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="Ingestion decides what your model will ever see, and nothing watches it."
      lead={
        <>
          A loader flattens a table, a scanned PDF loads as no text, a splitter cuts a clause in half, an embedding call
          sends a customer's account number to a hosted model. None of it raises an error. complydoc records each step of your pipeline as it runs,
          and measures what it did to your own files.
        </>
      }
    >
      <dl className="flex max-w-4xl flex-col">
        {ISSUES.map((issue, i) => (
          <div key={issue.area}>
            {i > 0 && <Separator />}
            <div className="grid gap-2 py-6 md:grid-cols-[12rem_1fr] md:gap-8">
              <dt className="flex items-center gap-2 self-start text-sm font-medium text-primary">
                <issue.icon className="size-4" />
                {issue.area}
              </dt>
              <dd className="flex flex-col gap-1">
                <span className="text-lg font-medium">{issue.title}</span>
                <span className="text-muted-foreground">{issue.detail}</span>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </Section>
  );
}
