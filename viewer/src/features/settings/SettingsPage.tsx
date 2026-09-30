import { Section, SectionStack } from "@/components/Section";
import { useCategories } from "@/hooks/useCategories";
import { useConcepts } from "@/hooks/useConcepts";
import { useIgnores } from "@/hooks/useIgnores";
import { fileName } from "@/report/format";
import type { Report } from "@/report/types";
import { CategoriesSection } from "./CategoriesSection";
import { ConceptsSection } from "./ConceptsSection";
import { IgnoredSection } from "./IgnoredSection";
import { PreferredModels } from "./PreferredModels";

/**
 * Your setup: your own things to look for, which categories are looked for, the models
 * reports are priced on, and the findings set aside. The concepts, categories and ignored findings are files
 * beside the documents this report audited, which the command line reads too;
 * the models are this browser's. Opened other than by `complydoc ui`, the files
 * are shown as the run used them, read only.
 */
export function SettingsPage({ report, source }: { report: Report; source?: string }) {
  const ignores = useIgnores();
  const concepts = useConcepts(report, source);
  const categories = useCategories(report, source);

  return (
    <SectionStack>
      <Section title="Your concepts" aside={concepts.file ? fileName(concepts.file) : "No concepts file"}>
        <ConceptsSection state={concepts} lastRun={report.concepts?.concepts ?? null} />
      </Section>

      <Section title="Categories" aside={categories.file ? fileName(categories.file) : "No categories file"}>
        <CategoriesSection state={categories} lastRun={report.categories ?? null} />
      </Section>

      <Section title="Preferred models" aside="This browser">
        <PreferredModels />
      </Section>

      <Section title="Ignored findings" aside={ignores.file ? fileName(ignores.file) : "No ignore file"}>
        <IgnoredSection lastRun={report.ignores?.rules ?? null} />
      </Section>
    </SectionStack>
  );
}
