import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fileName, formatCount, humanise } from "@/report/format";
import type { OnlySome } from "@/report/select";
import type { IdentifierDifference } from "@/report/types";

/** Documents and metadata keys some loaders returned and others did not. */
export function ReturnedList({ rows }: { rows: OnlySome[] }) {
  return (
    <ItemGroup aria-label="Returned by some loaders only">
      {rows.map((row) => (
        <Item key={`${row.kind}-${row.name}`} role="listitem" size="xs" variant="muted">
          <ItemContent>
            <ItemTitle className="font-mono">{row.name}</ItemTitle>
            <ItemDescription>{row.kind}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {row.loaders.map((loader) => (
              <Badge key={loader} variant="secondary">
                {loader}
              </Badge>
            ))}
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

/** Differences listed before the rest wait behind a button. */
const FIRST = 8;

/** Identifiers one loader's text or metadata carried and another's did not, masked, with where. */
export function DifferenceList({ rows }: { rows: IdentifierDifference[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FIRST);
  return (
    <div className="flex flex-col gap-2">
      <ItemGroup aria-label="Identifiers only some loaders kept">
        {shown.map((row, index) => (
          <Item
            key={`${row.document ?? ""}-${row.location}-${row.category}-${row.value}-${index}`}
            role="listitem"
            size="xs"
            variant="muted"
          >
            <ItemContent>
              <ItemTitle>{row.label ?? humanise(row.category)}</ItemTitle>
              <ItemDescription className="text-xs">
                <code className="font-mono">{row.value}</code>
                {row.document && <> · {fileName(row.document)}</>}
                {row.location === "metadata" && " · in metadata"}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {row.found_by.map((loader) => (
                <Badge key={loader} variant="success">
                  {loader}
                </Badge>
              ))}
              {row.missed_by.map((loader) => (
                <Badge key={loader} variant="destructive">
                  {loader}
                </Badge>
              ))}
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      {rows.length > FIRST && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((value) => !value)}>
          {all ? "Show fewer" : `Show ${formatCount(rows.length - FIRST)} more`}
        </Button>
      )}
    </div>
  );
}
