import { Snippet, SnippetCopyButton, SnippetInput, SnippetAddon } from "@/components/ai-elements/snippet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NextStep } from "@/report/next";

/** Commands that would tell you more about this folder, each ready to copy. */
export function NextSteps({ steps }: { steps: NextStep[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {steps.map((step) => (
        <Card key={step.id} size="sm">
          <CardHeader>
            <CardTitle>{step.title}</CardTitle>
            <CardDescription className="text-pretty">{step.why}</CardDescription>
          </CardHeader>
          <CardContent>
            <Snippet code={step.command}>
              <SnippetInput aria-label={step.title} className="text-xs" />
              <SnippetAddon align="inline-end">
                <SnippetCopyButton aria-label={`Copy: ${step.title}`} />
              </SnippetAddon>
            </Snippet>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
