import { RotateCcwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { SeverityIcon } from "@/components/LevelIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CategoriesState } from "@/hooks/useCategories";
import { humanise } from "@/report/format";
import { SEVERITIES } from "@/report/select";
import type { CategoryRow, CategorySummary, Severity } from "@/report/types";

const isChanged = (row: CategoryRow) => row.enabled !== row.shipped_enabled || row.severity !== row.shipped_severity;

function Row({ row, state }: { row: CategoryRow; state: CategoriesState }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2">
      <Checkbox
        checked={row.enabled}
        aria-label={`Look for ${row.label}`}
        onCheckedChange={(checked) => void state.change(row.id, { enabled: checked === true })}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className={row.enabled ? "text-sm" : "text-sm text-muted-foreground line-through"}>{row.label}</span>
        <span className="text-xs text-muted-foreground">{row.region}</span>
        {row.model_backed && <Badge variant="secondary">Read by a model</Badge>}
        {isChanged(row) && <Badge variant="outline">Changed</Badge>}
      </div>
      <Select
        value={row.severity}
        disabled={!row.enabled}
        onValueChange={(value) => void state.change(row.id, { severity: value as Severity })}
      >
        <SelectTrigger size="sm" aria-label={`Severity of ${row.label}`} className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {SEVERITIES.map((severity) => (
              <SelectItem key={severity} value={severity}>
                <SeverityIcon severity={severity} />
                {humanise(severity)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Put ${row.label} back as shipped`}
        className={isChanged(row) ? undefined : "invisible"}
        onClick={() => void state.reset(row.id)}
      >
        <RotateCcwIcon />
      </Button>
    </li>
  );
}

/** What the run on screen changed, where the categories cannot be edited from here. */
function LastRun({ summary }: { summary: CategorySummary | null }) {
  if (!summary || summary.changes.length === 0)
    return <p className="text-sm text-muted-foreground">This run looked for every category as shipped.</p>;
  return (
    <ul aria-label="Changed categories" className="flex flex-col gap-1 text-sm">
      {summary.changes.map((c) => (
        <li key={c.category}>
          <span className="font-medium">{c.label}</span>{" "}
          <span className="text-muted-foreground">
            {[
              c.enabled === c.shipped_enabled ? null : c.enabled ? "switched on" : "switched off",
              c.severity === c.shipped_severity ? null : `${c.severity} severity, not ${c.shipped_severity}`,
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every identifier category: whether it is looked for, and how serious a finding of it is.
 * The changes are a file beside the documents, which the command line reads too, and take
 * effect on the next run.
 */
export function CategoriesSection({ state, lastRun }: { state: CategoriesState; lastRun: CategorySummary | null }) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<string>("all");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.categories.filter(
      (row) =>
        (only === "all" || (only === "changed" ? isChanged(row) : !row.enabled)) &&
        (!needle || `${row.label} ${row.region} ${row.id}`.toLowerCase().includes(needle)),
    );
  }, [state.categories, query, only]);

  if (!state.editable) return <LastRun summary={lastRun} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a category"
          aria-label="Find a category"
          className="max-w-xs"
        />
        <ToggleGroup type="single" variant="outline" size="sm" value={only} onValueChange={(v) => setOnly(v || "all")}>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="changed">Changed</ToggleGroupItem>
          <ToggleGroupItem value="off">Switched off</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-xs text-muted-foreground">Takes effect on the next run.</span>
      </div>
      <p className="text-xs text-muted-foreground">
        A category switched off is not looked for, so it is not masked in reports either: what it would have found shows
        as written.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No category matches.</p>
      ) : (
        <ul aria-label="Categories" className="divide-y rounded-lg border bg-card">
          {rows.map((row) => (
            <Row key={row.id} row={row} state={state} />
          ))}
        </ul>
      )}
    </div>
  );
}
