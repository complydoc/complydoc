import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, Trash2Icon } from "lucide-react";
import { Hint } from "@/components/Hint";
import { Button } from "@/components/ui/button";
import { checkFor, outcome, type ExpectedFact, type Outcome } from "@/report/evals";
import { fileName } from "@/report/format";
import type { EvalCheck, EvalSummary } from "@/report/types";

const MARK: Record<Outcome, { icon: typeof CircleCheckIcon; tone: string; says: string }> = {
  kept: { icon: CircleCheckIcon, tone: "text-success", says: "kept it" },
  near: { icon: CircleDashedIcon, tone: "text-warning", says: "came close" },
  lost: { icon: CircleXIcon, tone: "text-destructive", says: "lost it" },
};

/** What each reader made of one fact, and for a reader that missed, what it read in its place. */
function Readings({ check, readers }: { check: EvalCheck; readers: string[] }) {
  const missed = readers.filter((reader) => outcome(check, reader) !== "kept" && check.nearest?.[reader]);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {readers.map((reader) => {
          const mark = MARK[outcome(check, reader)];
          return (
            <li key={reader} className="flex items-center gap-1.5">
              <mark.icon className={`size-3.5 ${mark.tone}`} aria-hidden="true" />
              <span>{reader}</span>
              <span className="sr-only">{mark.says}</span>
            </li>
          );
        })}
      </ul>
      {missed.map((reader) => (
        <p key={reader} className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs leading-5">
          <span className="font-sans text-muted-foreground">{reader} read </span>
          {check.nearest?.[reader]}
        </p>
      ))}
    </div>
  );
}

interface FactListProps {
  facts: ExpectedFact[];
  evals: EvalSummary | null;
  /** Take a fact out of the file, where the file can be changed from here. */
  onRemove?: (fact: ExpectedFact) => void;
}

/**
 * The passages a reading must contain, each with what every reader made of it. A miss
 * shows the words the reader produced where the fact should be, which is usually the
 * reason: two columns read across, a table row split, a word broken at a line end.
 */
export function FactList({ facts, evals, onRemove }: FactListProps) {
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {facts.map((fact) => {
        const check = checkFor(evals, fact);
        return (
          <li key={`${fact.text}\u0000${fact.document ?? ""}`} className="flex items-start gap-3 p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-sm font-medium">{fact.text}</p>
              <p className="text-xs text-muted-foreground">
                {fact.document ? fileName(fact.document) : "Any document"}
                {!check && " · not checked yet"}
              </p>
              {check && evals && <Readings check={check} readers={evals.readers} />}
            </div>
            {onRemove && (
              <Hint label="No longer expect this">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`No longer expect: ${fact.text}`}
                  onClick={() => onRemove(fact)}
                >
                  <Trash2Icon />
                </Button>
              </Hint>
            )}
          </li>
        );
      })}
    </ul>
  );
}
