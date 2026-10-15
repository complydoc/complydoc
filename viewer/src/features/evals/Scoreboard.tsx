import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { scoreboard } from "@/report/evals";
import type { EvalSummary } from "@/report/types";

/**
 * Each reading's score on the folder's expected facts, best first. A fact counts when it
 * was read as it is written; a near miss is counted beside it, not with it.
 */
export function Scoreboard({ evals }: { evals: EvalSummary }) {
  const scores = scoreboard(evals);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reading</TableHead>
          <TableHead className="w-1/3">Facts kept</TableHead>
          <TableHead className="text-right">Kept</TableHead>
          <TableHead className="text-right">Near misses</TableHead>
          <TableHead className="text-right">Lost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {scores.map((score, index) => (
          <TableRow key={score.reader}>
            <TableCell className="font-medium">
              {score.reader}
              {index === 0 && scores.length > 1 && score.kept > (scores[1]?.kept ?? 0) && (
                <span className="ml-2 text-xs font-normal text-success">best</span>
              )}
            </TableCell>
            <TableCell>
              <Progress
                value={score.total ? (score.kept / score.total) * 100 : 0}
                aria-label={`${score.reader} kept ${score.kept} of ${score.total}`}
              />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {score.kept} of {score.total}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{score.near}</TableCell>
            <TableCell
              className={`text-right tabular-nums ${score.lost > 0 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {score.lost}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
