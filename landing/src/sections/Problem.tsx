import { CoinsIcon, FileWarningIcon, ShieldAlertIcon, TimerIcon, type LucideIcon } from "lucide-react";
import { Section } from "@/components/Section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    title: "What the loader extracted",
    detail:
      "Two-column pages read across the columns, tables flattened into lines, headers repeated in every chunk. Loaders do not report any of this as an error.",
  },
  {
    area: "Time",
    icon: TimerIcon,
    title: "How long it takes",
    detail: "Loaders differ in speed on the same files, and the slower one does not always extract more.",
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
    title: "What ends up in your index",
    detail:
      "Personal and financial identifiers, and hidden text addressed to AI assistants, pass through loaders unchanged.",
  },
];

export function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="Loaders are usually chosen without checking what they extract."
      lead={
        <>
          The choice is often made in a notebook: load a PDF, read the first page, move on. After that, the loader
          decides which clauses reach the index, whether tables keep their structure, which identifiers get embedded,
          and which pages go to a vision model. complydoc measures each of these on your own files.
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ISSUES.map((issue) => (
          <Card key={issue.area}>
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <issue.icon className="size-4" />
                {issue.area}
              </CardDescription>
              <CardTitle className="text-lg">{issue.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{issue.detail}</CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
