import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Passage } from "@/data/injection";
import { cn } from "@/lib/utils";

/** The score as a bar, with the threshold marked on it. */
function ScoreBar({ score, threshold }: { score: number; threshold: number }) {
  const over = score >= threshold;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-2 flex-1 rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-muted-foreground/40")}
          style={{ width: `${score * 100}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute -top-1.5 h-5 w-0.5 rounded-full bg-foreground"
          style={{ left: `calc(${threshold * 100}% - 1px)` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-sm">{score.toFixed(2)}</span>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-3 py-4">
      <span className="flex size-6 items-center justify-center rounded-full border font-mono text-xs text-muted-foreground">
        {n}
      </span>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** What happens to one passage: the patterns, the System One model if the patterns missed it, and the report. */
export function Pipeline({ passage, threshold }: { passage: Passage; threshold: number }) {
  const byPattern = passage.patterns.length > 0;
  const byModel = !byPattern && passage.score >= threshold;
  const reported = byPattern || byModel;
  const isInstruction = passage.kind !== "decoy";

  return (
    <ol className="flex flex-col">
      <Step n={1} title="Patterns, on your machine">
        {byPattern ? (
          <div className="flex flex-wrap gap-2">
            {passage.patterns.map((reason) => (
              <Badge key={reason} variant="destructive">
                {reason}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No pattern matches this wording.</p>
        )}
      </Step>
      <Separator />
      <Step n={2} title="System One model, TypeSafe AI">
        {byPattern ? (
          <p className="text-sm text-muted-foreground">
            Not asked. A pattern already reported this passage, so it is not sent anywhere.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Sent to api.typesafe.ai ({passage.text.length} characters). Probability it is addressed to a model:
            </p>
            <ScoreBar score={passage.score} threshold={threshold} />
          </>
        )}
      </Step>
      <Separator />
      <Step n={3} title="Report">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {reported ? (
            <Badge variant="destructive">reported, {byPattern ? "pattern" : "model"} evidence</Badge>
          ) : (
            <Badge variant="secondary">not reported</Badge>
          )}
          <span className="text-muted-foreground">
            {isInstruction && reported && "Correct: it is written at a model."}
            {isInstruction && !reported && "Missed: an instruction scored below the threshold."}
            {!isInstruction && reported && "Wrongly flagged: it is written for people."}
            {!isInstruction && !reported && "Correct: it is written for people."}
          </span>
        </div>
      </Step>
    </ol>
  );
}
