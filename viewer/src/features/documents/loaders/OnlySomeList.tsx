import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { humanise } from "@/report/format";
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

/** Identifiers one loader's text or metadata carried and another's did not, masked. */
export function DifferenceList({ rows }: { rows: IdentifierDifference[] }) {
  return (
    <ItemGroup aria-label="Identifiers only some loaders kept">
      {rows.map((row) => (
        <Item key={`${row.location}-${row.category}-${row.value}`} role="listitem" size="xs" variant="muted">
          <ItemContent>
            <ItemTitle>{humanise(row.category)}</ItemTitle>
            <ItemDescription className="font-mono text-xs">
              {row.value} · {row.location}
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
  );
}
