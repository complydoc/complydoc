import { Undo2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { activeEntry, useIgnores } from "@/hooks/useIgnores";
import { fileName, formatDate } from "@/report/format";
import { documentHref } from "@/report/route";
import type { IgnoredRow } from "@/report/security";

/** What an ignore file set aside on this run: each finding, where, and the reason given. */
export function IgnoredFindings({ rows }: { rows: IgnoredRow[] }) {
  const { editable, entries, unignore } = useIgnores();
  return (
    <ItemGroup aria-label="Ignored findings">
      {rows.map((row) => {
        // Taken out of the file since this run: it counts again on the next.
        const lifted = editable && !activeEntry(entries, row.fingerprint);
        return (
          <Item key={row.id} role="listitem" variant="outline" size="sm" className="bg-card">
            <ItemContent>
              <ItemTitle className="flex-wrap">
                <span>{row.what}</span>
                <a
                  href={documentHref(row.document, row.page)}
                  className="font-normal text-muted-foreground underline-offset-4 hover:underline"
                >
                  {fileName(row.path)}
                  {row.page !== null && `, page ${row.page}`}
                </a>
              </ItemTitle>
              <ItemDescription className="line-clamp-none">
                {row.reason}
                <span className="text-faint">
                  {row.by && ` — ${row.by}`}
                  {row.until && `, until ${formatDate(row.until)}`}
                </span>
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {lifted ? (
                <Badge variant="secondary">Counted again from the next run</Badge>
              ) : (
                editable && (
                  <Button variant="ghost" size="sm" onClick={() => void unignore(row.fingerprint)}>
                    <Undo2Icon />
                    Stop ignoring
                  </Button>
                )
              )}
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}
