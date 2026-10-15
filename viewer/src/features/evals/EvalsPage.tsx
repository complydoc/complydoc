import { PlayIcon } from "lucide-react";
import { NotInRun } from "@/components/NotInRun";
import { Section, SectionStack } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { useEvalsState } from "@/hooks/useEvals";
import { toast } from "@/lib/toast";
import { factsToShow } from "@/report/evals";
import { fileName, plural } from "@/report/format";
import type { Report } from "@/report/types";
import { AddFact } from "./AddFact";
import { FactList } from "./FactList";
import { Scoreboard } from "./Scoreboard";

/**
 * Evals on your own documents: the passages a reading of this folder must contain, and how
 * each reading did. An audit scores its own reader; a loader comparison scores every loader
 * side by side. The passages are kept in a file beside the documents, which `complydoc ui`
 * can add to.
 */
export function EvalsPage({ report }: { report: Report }) {
  const state = useEvalsState();
  // The facts as they are now, run against this run's text, once that has been done; else
  // what the run itself checked when it was made.
  const evals = state.scored ?? report.evals ?? null;
  const facts = factsToShow(state.facts, evals);
  const scored = (evals?.checks.length ?? 0) > 0;

  if (!scored && !state.editable && facts.length === 0) return <NotInRun report={report} content="evals" />;

  const runNow = async () => {
    if (await state.run()) toast("Checked against this run's text");
  };

  return (
    <SectionStack>
      {scored && evals && (
        <Section
          title="Scoreboard"
          aside={`${plural(evals.checks.length, "fact")} · ${plural(evals.readers.length, "reading")}`}
        >
          <Scoreboard evals={evals} />
        </Section>
      )}
      <Section
        title="Expected facts"
        aside={
          <span className="flex items-center gap-3">
            {(state.file ?? evals?.file) ? fileName(state.file ?? evals?.file ?? "") : "No evals file yet"}
            {state.facts !== null && facts.length > 0 && (
              <Button variant="outline" size="sm" disabled={state.running} onClick={() => void runNow()}>
                <PlayIcon />
                {state.running ? "Running…" : "Run evals"}
              </Button>
            )}
          </span>
        }
      >
        {report.evals?.error && !state.scored && (
          <p className="text-sm text-destructive">The evals file could not be read: {report.evals.error}</p>
        )}
        {facts.length > 0 ? (
          <FactList
            facts={facts}
            evals={evals}
            {...(state.editable ? { onRemove: (fact) => void state.remove(fact) } : {})}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing is expected yet. Add a passage one of these documents must come out with, here or by selecting it in
            a document, and it is checked against every reading this run holds.
          </p>
        )}
        {state.editable && (
          <AddFact documents={report.documents.map((d) => d.relative_path)} error={state.error} onAdd={state.add} />
        )}
      </Section>
    </SectionStack>
  );
}
