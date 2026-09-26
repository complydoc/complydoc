import { EvidenceIcon, SeverityIcon } from "@/components/LevelIcons";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { fileName } from "@/report/format";
import type { JudgedRow } from "@/report/judged";
import { documentHref } from "@/report/route";

/**
 * Pages a judgement model said hold one of your concepts. A model says whether a
 * page holds it, not where on the page, so each opens the page rather than a
 * place in it; and a model's word is the weakest evidence there is.
 */
export function JudgedConcepts({ rows, judge }: { rows: JudgedRow[]; judge: string | null }) {
  return (
    <ItemGroup aria-label="Found by a model">
      {rows.map((row) => (
        <Item key={row.id} role="listitem" variant="outline" size="sm" className="bg-card">
          <ItemContent>
            <ItemTitle>
              <SeverityIcon severity={row.severity} />
              {row.label}
            </ItemTitle>
            <ItemDescription>
              <a href={documentHref(row.document, row.page)} className="underline-offset-4 hover:underline">
                {fileName(row.path)}, page {row.page}
              </a>
            </ItemDescription>
          </ItemContent>
          <ItemActions className="text-xs text-muted-foreground tabular-nums">
            <span title={`${judge ?? "The model"} put it at ${Math.round(row.score * 100)}%`}>
              {Math.round(row.score * 100)}%
            </span>
            <EvidenceIcon evidence="model" />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
