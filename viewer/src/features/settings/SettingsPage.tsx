import { InfoIcon } from "lucide-react";
import { Section, SectionStack } from "@/components/Section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useConcepts } from "@/hooks/useConcepts";
import { useIgnores } from "@/hooks/useIgnores";
import { fileName } from "@/report/format";
import type { Report } from "@/report/types";
import { ConceptsSection } from "./ConceptsSection";
import { IgnoredSection } from "./IgnoredSection";

/**
 * Your setup, beside the documents this report audited: the findings set aside,
 * and your own things to look for. Changes are saved to the files there, which
 * the command line reads too, and apply from the next run; this report stays as
 * it was taken.
 */
export function SettingsPage({ report, source }: { report: Report; source?: string }) {
  const ignores = useIgnores();
  const concepts = useConcepts(report, source);
  const editable = ignores.editable || concepts.editable;
  const target = report.run.target;

  return (
    <SectionStack>
      <Alert>
        <InfoIcon />
        <AlertTitle>{editable ? "Changes apply from the next run" : "Read only"}</AlertTitle>
        <AlertDescription>
          {editable ? (
            <p>
              Saved beside the documents in <code className="font-mono">{target}</code>. This report stays as it was
              taken; run <code className="font-mono">complydoc audit {target}</code> to see the changes.
            </p>
          ) : (
            <p>
              What this run used. Open the report with <code className="font-mono">complydoc ui</code> to change it, or
              edit the files beside the documents.
            </p>
          )}
        </AlertDescription>
      </Alert>

      <Section title="Ignored findings" aside={ignores.file ? fileName(ignores.file) : "No ignore file"}>
        <IgnoredSection lastRun={report.ignores?.rules ?? []} />
      </Section>

      <Section title="Your concepts" aside={concepts.file ? fileName(concepts.file) : "No concepts file"}>
        <ConceptsSection state={concepts} lastRun={report.concepts?.concepts ?? []} />
      </Section>
    </SectionStack>
  );
}
