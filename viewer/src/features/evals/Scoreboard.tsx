import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "cn";
import { ToolName } from "@/components/ToolLogo";
import { scoreboard, type Score } from "@/report/evals";
import type { EvalSummary } from "@/report/types";

const rate = (score: Score) => (score.total ? score.kept / score.total : 0);

/** Kept, near and lost as one bar, the way a test run shows passed, flaky and failed. */
function Spread({ score }: { score: Score }) {
  const part = (n: number) => `${score.total ? (n / score.total) * 100 : 0}%`;
  return (
    <div
      role="img"
      aria-label={`${score.reader} kept ${score.kept} of ${score.total}`}
      className="flex h-2 w-full min-w-24 overflow-hidden rounded-[2px] bg-muted"
    >
      <span className="bg-success" style={{ width: part(score.kept) }} />
      <span className="bg-warning" style={{ width: part(score.near) }} />
      <span className="bg-destructive" style={{ width: part(score.lost) }} />
    </div>
  );
}

/**
 * Each reading's score on the folder's expected facts, best first. A fact counts when it
 * was read as it is written; a near miss is counted beside it, not with it.
 */
export function Scoreboard({ evals }: { evals: EvalSummary }) {
  const scores = scoreboard(evals);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Reading</TableHead>
            <TableHead className="text-right">Pass rate</TableHead>
            <TableHead className="w-2/5">Results</TableHead>
            <TableHead className="text-right">Passed</TableHead>
            <TableHead className="text-right">Near</TableHead>
            <TableHead className="pr-4 text-right">Failed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scores.map((score, index) => (
            <TableRow key={score.reader}>
              <TableCell className="pl-4 text-[0.8125rem] font-medium">
                <ToolName name={score.reader} />
                {index === 0 && scores.length > 1 && score.kept > (scores[1]?.kept ?? 0) && (
                  <span className="ml-2 font-sans caps text-success">best</span>
                )}
              </TableCell>
              <TableCell
                className={cn(
                  "figure text-right text-base font-medium",
                  rate(score) === 1 ? "text-success" : rate(score) < 0.5 ? "text-destructive" : "text-foreground",
                )}
              >
                {Math.round(rate(score) * 100)}%
              </TableCell>
              <TableCell>
                <Spread score={score} />
              </TableCell>
              <TableCell className="figure text-right">
                {score.kept} of {score.total}
              </TableCell>
              <TableCell className={cn("figure text-right", score.near ? "text-warning" : "text-faint")}>
                {score.near}
              </TableCell>
              <TableCell className={cn("figure pr-4 text-right", score.lost ? "text-destructive" : "text-faint")}>
                {score.lost}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
