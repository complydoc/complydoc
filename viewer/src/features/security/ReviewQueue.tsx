import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, EyeOffIcon, Undo2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { SeverityIcon } from "@/components/LevelIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useFullDocument, withDocument } from "@/hooks/useFullDocument";
import { activeEntry, ignoreCommand, useIgnores } from "@/hooks/useIgnores";
import { fileName, formatCount } from "@/report/format";
import { contextOf, nextUnreviewed, progressOf, readKept, reviewId, reviewKey, writeKept } from "@/report/review";
import { documentHref } from "@/report/route";
import { findingRows } from "@/report/security";
import type { Report } from "@/report/types";

/** A key and what it does, shown beside the control it stands for. */
function Key({ children }: { children: string }) {
  return <kbd className="rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">{children}</kbd>;
}

function go(index: number) {
  window.location.assign(`#security/review/${index}`);
}

/**
 * Every finding, one at a time, the most serious first: keep it as a real finding, or
 * ignore it with a reason. J and K move, C keeps, I ignores, N skips to the next one not
 * yet reviewed, and Esc goes back to the Security page.
 */
export function ReviewQueue({ report, at }: { report: Report; at: number }) {
  const rows = useMemo(() => findingRows(report), [report]);
  const key = reviewKey(report);
  const [kept, setKept] = useState(() => readKept(key));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const reasonBox = useRef<HTMLTextAreaElement>(null);
  const { editable, entries, ignore, unignore } = useIgnores();

  const index = Math.min(Math.max(0, at), Math.max(0, rows.length - 1));
  const row = rows[index];
  // A large report keeps a document's page text beside it: the line a finding sits in waits for it.
  const full = useFullDocument(report, row?.document);
  const fingerprint = row?.source.fingerprint;
  const id = row ? reviewId(row) : undefined;
  const isIgnored = (value: string) => activeEntry(entries, value) !== undefined;
  const progress = progressOf(rows, kept, isIgnored);
  const ignoredEntry = fingerprint ? activeEntry(entries, fingerprint) : undefined;
  const isKept = id ? kept.has(id) && !ignoredEntry : false;
  const done = (candidate: (typeof rows)[number]) => {
    const value = candidate.source.fingerprint;
    return kept.has(reviewId(candidate)) || (value !== undefined && isIgnored(value));
  };

  const setKeptTo = (value: string, keep: boolean) => {
    const next = new Set(kept);
    if (keep) next.add(value);
    else next.delete(value);
    setKept(next);
    writeKept(key, next);
  };

  const advance = () => {
    const next = nextUnreviewed(rows, index, done);
    if (next !== null && next !== index) go(next);
    else if (index + 1 < rows.length) go(index + 1);
  };

  const keep = () => {
    if (!id) return;
    setKeptTo(id, true);
    advance();
  };

  const saveIgnore = async () => {
    if (!fingerprint || !row || !reason.trim()) return;
    setSaving(true);
    const saved = await ignore({ finding: fingerprint, reason: reason.trim(), what: `${row.label} ${row.masked}` });
    setSaving(false);
    if (saved) {
      setReason("");
      if (id) setKeptTo(id, false);
      advance();
    }
  };

  // The keys, as an annotation queue has them. Typing a reason takes the keys for itself.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof Element ? event.target.closest("input, textarea") : null;
      if (event.key === "Escape") {
        if (typing) (typing as HTMLElement).blur();
        else window.location.assign("#security");
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      const keyName = event.key.toLowerCase();
      if (keyName === "j" || event.key === "ArrowRight") go(Math.min(index + 1, rows.length - 1));
      else if (keyName === "k" || event.key === "ArrowLeft") go(Math.max(index - 1, 0));
      else if (keyName === "c") keep();
      else if (keyName === "n") advance();
      else if (keyName === "i" && editable) {
        event.preventDefault();
        reasonBox.current?.focus();
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!row) {
    return <p className="text-sm text-muted-foreground">This run found no identifier to review.</p>;
  }
  const context = full.state === "ready" ? contextOf(withDocument(report, row.document, full.document), row) : null;
  const percent = progress.total ? (progress.reviewed / progress.total) * 100 : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <a href="#security">
            <ArrowLeftIcon />
            Security
          </a>
        </Button>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium tabular-nums">
              Finding {formatCount(index + 1)} of {formatCount(rows.length)}
            </span>
            <span className="text-muted-foreground tabular-nums" aria-live="polite">
              {formatCount(progress.reviewed)} reviewed · {formatCount(progress.kept)} kept ·{" "}
              {formatCount(progress.ignored)} ignored
            </span>
          </div>
          <Progress value={percent} aria-label="Findings reviewed" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SeverityIcon severity={row.severity} />
            {row.label}
            <code className="font-mono text-sm font-normal text-muted-foreground">{row.masked}</code>
            {ignoredEntry && <Badge variant="secondary">Ignored</Badge>}
            {isKept && <Badge variant="success">Kept</Badge>}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <a
              href={documentHref(row.document, row.page, { kind: "identifier", index: row.match })}
              className="hover:underline"
            >
              {fileName(row.path)}
              {row.page !== null && `, page ${row.page}`}
            </a>
            <EvidenceBadge evidence={row.evidence} match={row.source} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {context ? (
            <blockquote className="rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
              {context.before !== null && <span className="block text-muted-foreground">{context.before}</span>}
              <span className="block">
                {context.line.lead}
                <mark className="rounded bg-destructive/20 px-0.5 text-foreground">{context.line.hit}</mark>
                {context.line.tail}
              </span>
              {context.after !== null && <span className="block text-muted-foreground">{context.after}</span>}
            </blockquote>
          ) : (
            <p className="text-sm text-muted-foreground">
              The run kept no page text to show it in. Open the document to see where it is.
            </p>
          )}

          {ignoredEntry ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Ignored: {ignoredEntry.reason}</span>
              {editable && fingerprint && (
                <Button variant="ghost" size="sm" onClick={() => void unignore(fingerprint)}>
                  <Undo2Icon />
                  Stop ignoring
                </Button>
              )}
            </div>
          ) : editable && fingerprint ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveIgnore();
              }}
            >
              <Textarea
                ref={reasonBox}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void saveIgnore();
                  }
                }}
                placeholder="Why this is not a problem, if it is not: our own account, a test value…"
                aria-label="Reason to ignore it"
                rows={2}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={keep} disabled={!id}>
                  <CheckIcon />
                  Keep <Key>C</Key>
                </Button>
                <Button type="submit" size="sm" variant="outline" disabled={!reason.trim() || saving}>
                  <EyeOffIcon />
                  Ignore with this reason <Key>I</Key>
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button size="sm" onClick={keep} disabled={!id}>
                <CheckIcon />
                Keep <Key>C</Key>
              </Button>
              {fingerprint && (
                <span className="text-muted-foreground">
                  To ignore it: <code className="font-mono text-xs">{ignoreCommand(fingerprint)}</code>
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost" size="sm" onClick={() => go(Math.max(index - 1, 0))} disabled={index === 0}>
          <ArrowLeftIcon />
          Previous <Key>K</Key>
        </Button>
        <Button variant="ghost" size="sm" onClick={advance}>
          Next not reviewed <Key>N</Key>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(Math.min(index + 1, rows.length - 1))}
          disabled={index + 1 >= rows.length}
        >
          Next <Key>J</Key>
          <ArrowRightIcon />
        </Button>
      </div>
    </div>
  );
}
