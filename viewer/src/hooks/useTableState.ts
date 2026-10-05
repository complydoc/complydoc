import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useHashParam } from "./useHashRoute";

/** `name:desc,pages:asc` and back. */
function readSort(value: string | null): SortingState {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.split(":"))
    .filter(([id]) => Boolean(id))
    .map(([id = "", order]) => ({ id, desc: order === "desc" }));
}

const writeSort = (sorting: SortingState) =>
  sorting.length ? sorting.map((s) => `${s.id}:${s.desc ? "desc" : "asc"}`).join(",") : null;

export interface TableState {
  sorting: SortingState;
  setSorting: OnChangeFn<SortingState>;
  query: string;
  setQuery: (query: string) => void;
}

/**
 * A table's sort and search. With `key`, kept in the address (`#documents?docs.sort=pages:desc`),
 * so going back to a page finds it as it was left, and a view can be linked; without, kept here.
 */
export function useTableState(key?: string): TableState {
  const [sortParam, setSortParam] = useHashParam(`${key ?? ""}.sort`);
  const [queryParam, setQueryParam] = useHashParam(`${key ?? ""}.q`);
  const [localSort, setLocalSort] = useState<SortingState>([]);
  const [localQuery, setLocalQuery] = useState("");
  // The same list while the address says the same: the table takes a new list for a new
  // sort, resets its page for it, and would do so again on every render, without end.
  const sorting = useMemo(() => readSort(sortParam), [sortParam]);
  if (!key) return { sorting: localSort, setSorting: setLocalSort, query: localQuery, setQuery: setLocalQuery };
  return {
    sorting,
    setSorting: (update) => setSortParam(writeSort(typeof update === "function" ? update(sorting) : update)),
    query: queryParam ?? "",
    setQuery: (query) => setQueryParam(query || null),
  };
}
