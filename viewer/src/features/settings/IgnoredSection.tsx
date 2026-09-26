import { Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { useIgnores } from "@/hooks/useIgnores";
import { cn } from "@/lib/utils";
import { formatDate } from "@/report/format";
import type { IgnoreRule } from "@/report/types";

/** A field that reads as text until it is pointed at or edited, so a long list stays calm. */
const QUIET =
  "border-transparent bg-transparent px-1.5 shadow-none hover:border-input focus-visible:border-input dark:bg-transparent";

/** What an entry did on the run on screen, in a few words. */
function lastRunNote(entry: IgnoreRule, lastRun: IgnoreRule[]): { text: string; warn: boolean } {
  const seen = lastRun.find((rule) => rule.finding === entry.finding);
  const today = new Date().toISOString().slice(0, 10);
  if (entry.until && entry.until < today) return { text: "Expired: counted again", warn: true };
  if (!seen) return { text: "Added since this run", warn: false };
  if (!seen.matched) return { text: "Matched nothing on this run", warn: true };
  return { text: `Set aside ${seen.matched} on this run`, warn: false };
}

/**
 * Every finding the ignore file sets aside, with the reason and the date it ends.
 * Under `complydoc ui` the reason and the date can be changed, and an entry removed.
 */
export function IgnoredSection({ lastRun }: { lastRun: IgnoreRule[] }) {
  const { editable, entries, ignore, unignore } = useIgnores();

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing is ignored. Rest the pointer on a finding in a document and tick it off, or run{" "}
        <code>complydoc ignore</code>.
      </p>
    );
  }

  const update = (entry: IgnoreRule, change: Partial<IgnoreRule>) => {
    const next = { ...entry, ...change };
    void ignore({
      finding: next.finding,
      reason: next.reason,
      ...(next.until ? { until: next.until } : {}),
      ...(next.what ? { what: next.what } : {}),
      ...(next.paths?.length ? { paths: next.paths } : {}),
    });
  };

  return (
    <ItemGroup aria-label="Ignored findings">
      {entries.map((entry) => {
        const note = lastRunNote(entry, lastRun);
        return (
          <Item key={`${entry.finding}-${entry.paths?.join(",") ?? ""}`} role="listitem" variant="outline" size="sm">
            <ItemContent className="gap-2">
              <ItemTitle className="flex-wrap">
                <span>{entry.what ?? <code className="font-mono text-xs">{entry.finding}</code>}</span>
                <Badge variant={note.warn ? "outline" : "secondary"}>{note.text}</Badge>
              </ItemTitle>
              {editable ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    defaultValue={entry.reason}
                    aria-label="Reason"
                    className={cn("h-8 min-w-60 flex-1", QUIET)}
                    onBlur={(event) => {
                      const reason = event.target.value.trim();
                      if (reason && reason !== entry.reason) update(entry, { reason });
                    }}
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Until
                    <Input
                      type="date"
                      defaultValue={entry.until ?? ""}
                      aria-label="Until"
                      className={cn("h-8 w-40", QUIET, !entry.until && "text-muted-foreground")}
                      onChange={(event) => update(entry, { until: event.target.value || null })}
                    />
                  </label>
                </div>
              ) : (
                <p className="text-sm">{entry.reason}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {[
                  entry.by,
                  entry.added && `added ${formatDate(entry.added)}`,
                  !editable && entry.until && `until ${formatDate(entry.until)}`,
                  entry.paths?.length && `only in ${entry.paths.join(", ")}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </ItemContent>
            {editable && (
              <ItemActions>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Stop ignoring ${entry.what ?? entry.finding}`}
                  onClick={() => void unignore(entry.finding)}
                >
                  <Trash2Icon />
                </Button>
              </ItemActions>
            )}
          </Item>
        );
      })}
    </ItemGroup>
  );
}
