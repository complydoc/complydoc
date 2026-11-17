import { Trash2Icon } from "lucide-react";
import type { CSSProperties } from "react";
import { EvalStatus } from "@/components/EvalStatus";
import { ToolName } from "@/components/ToolLogo";
import { Hint } from "@/components/Hint";
import { Button } from "@/components/ui/button";
import { checkFor, outcome, type ExpectedFact, type Outcome } from "@/report/evals";
import { fileName } from "@/report/format";
import type { EvalCheck, EvalSummary } from "@/report/types";

const SAYS: Record<Outcome, string> = { kept: "kept it", near: "came close", lost: "lost it" };

/** A passage that must not appear is kept out, not kept. */
const ABSENT_SAYS: Record<Outcome, string> = { kept: "left it out", near: "holds something like it", lost: "holds it" };

const KIND: Record<string, string> = { text: "Passage", value: "Value", absent: "Must not appear" };

/** What a reader that missed read in the fact's place, and where a passage to leave out was held. */
function Misses({ check, readers }: { check: EvalCheck; readers: string[] }) {
  const absent = check.kind === "absent";
  const missed = readers.filter((reader) => outcome(check, reader) !== "kept" && check.nearest?.[reader]);
  const holding = absent ? readers.filter((reader) => outcome(check, reader) === "lost") : [];
  if (!missed.length && !holding.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {missed.map((reader) => (
        <p key={reader} className="flex items-start gap-3 rounded-sm bg-muted px-2.5 py-1.5 text-xs leading-5">
          <span className="sr-only">{reader} read: </span>
          <span className="min-w-0 flex-1 font-mono break-words">{check.nearest?.[reader]}</span>
          <span aria-hidden="true" className="shrink-0">
            <ToolName
              name={reader}
              className="rounded-sm border bg-background px-1.5 text-[0.6875rem] leading-5 text-muted-foreground"
            />
          </span>
        </p>
      ))}
      {holding.map((reader) => {
        const page = check.pages?.[reader];
        const where = check.documents?.[reader];
        return (
          <p key={reader} className="font-mono text-xs text-destructive">
            {reader} holds it{where ? ` in ${fileName(where)}` : ""}
            {page != null ? `, page ${page}` : ""}
          </p>
        );
      })}
    </div>
  );
}

/** The fact as the file has it: a passage, a value after its label, or a passage to leave out. */
function FactText({ fact }: { fact: ExpectedFact }) {
  if (fact.kind === "value") {
    return (
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        {fact.label && <span className="text-muted-foreground">{fact.label}</span>}
        <span className="figure font-medium">{fact.text}</span>
      </p>
    );
  }
  return <p className="text-sm leading-5">{fact.text}</p>;
}

interface FactListProps {
  facts: ExpectedFact[];
  evals: EvalSummary | null;
  /** Take a fact out of the file, where the file can be changed from here. */
  onRemove?: (fact: ExpectedFact) => void;
}

/**
 * The expected facts as a test run: one row a fact, one column a reader, each cell its
 * result. A miss shows the words the reader produced where the fact should be, which is
 * usually the reason: two columns read across, a table row split, a word broken at a line end.
 */
export function FactList({ facts, evals, onRemove }: FactListProps) {
  const readers = evals?.readers ?? [];
  const columns: CSSProperties = {
    gridTemplateColumns: `minmax(0,1fr) repeat(${readers.length}, minmax(4.5rem, max-content))${onRemove ? " 2rem" : ""}`,
  };
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div style={columns} className="grid items-center gap-x-4 border-b bg-panel-header px-4 py-2">
        <span className="caps">Expected</span>
        {readers.map((reader) => (
          <span key={reader} className="flex justify-center text-xs font-medium text-muted-foreground">
            <ToolName name={reader} />
          </span>
        ))}
        {onRemove && <span />}
      </div>
      <ul className="divide-y">
        {facts.map((fact) => {
          const check = checkFor(evals, fact);
          const absent = fact.kind === "absent";
          return (
            <li
              key={`${fact.text}\u0000${fact.document ?? ""}`}
              className="group/fact flex flex-col gap-2 px-4 py-2.5 hover:bg-muted/30"
            >
              <div style={columns} className="grid items-start gap-x-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <FactText fact={fact} />
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="caps text-[0.625rem]">{KIND[fact.kind ?? "text"]}</span>
                    <span aria-hidden="true" className="text-faint">
                      ·
                    </span>
                    <span className="font-mono">{fact.document ? fileName(fact.document) : "Any document"}</span>
                    {fact.page != null && <span className="font-mono">p. {fact.page}</span>}
                    {!check && <span>· not checked yet</span>}
                  </p>
                </div>
                {readers.map((reader) => {
                  if (!check) return <span key={reader} className="text-center text-faint">–</span>;
                  const result = outcome(check, reader);
                  return (
                    <span key={reader} className="flex justify-center pt-0.5">
                      <EvalStatus outcome={result} />
                      <span className="sr-only">{reader}: </span>
                      <span className="sr-only">{absent ? ABSENT_SAYS[result] : SAYS[result]}</span>
                    </span>
                  );
                })}
                {onRemove && (
                  <Hint label="No longer expect this">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover/fact:opacity-100 focus-visible:opacity-100"
                      aria-label={`No longer expect: ${fact.text}`}
                      onClick={() => onRemove(fact)}
                    >
                      <Trash2Icon />
                    </Button>
                  </Hint>
                )}
              </div>
              {check && evals && <Misses check={check} readers={readers} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
