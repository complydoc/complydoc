import { useState } from "react";
import { EyeOffIcon, Undo2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { activeEntry, ignoreCommand, useIgnores } from "@/hooks/useIgnores";

interface IgnoreButtonProps {
  fingerprint: string | undefined;
  /** The finding in words, written to the file so it can be read without the report. */
  what: string;
}

/**
 * Set one finding aside, with a reason. Served by `complydoc ui`, it writes the
 * audited folder's ignore file; opened any other way, it gives the command.
 * A finding ignored since the run says so, and takes effect on the next one.
 */
export function IgnoreButton({ fingerprint, what }: IgnoreButtonProps) {
  const { editable, entries, error, ignore, unignore } = useIgnores();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);
  if (!fingerprint) return null;

  const pending = activeEntry(entries, fingerprint);
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge variant="secondary" title={`Applies from the next run. ${pending.reason}`}>
          Ignored
        </Badge>
        {editable && (
          <Button variant="ghost" size="icon-sm" aria-label="Stop ignoring" onClick={() => void unignore(fingerprint)}>
            <Undo2Icon />
          </Button>
        )}
      </span>
    );
  }

  const save = async () => {
    setSaving(true);
    const done = await ignore({
      finding: fingerprint,
      reason,
      what,
      ...(until ? { until } : {}),
    });
    setSaving(false);
    if (done) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-muted-foreground">
          <EyeOffIcon />
          Ignore
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Ignore {what}</PopoverTitle>
          <PopoverDescription>
            It stays in the report, marked ignored with your reason, and leaves every count and every check.
          </PopoverDescription>
        </PopoverHeader>
        {editable ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              Why it is not a problem
              <Textarea
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Our own company account, printed on every invoice."
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span>
                Until <span className="text-muted-foreground">(optional)</span>
              </span>
              <Input type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving || !reason.trim()}>
              Ignore it
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-muted-foreground">
              Run this in the audited folder, or open the report with complydoc ui to do it here.
            </p>
            <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">
              {ignoreCommand(fingerprint)}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard?.writeText(ignoreCommand(fingerprint))}
            >
              Copy the command
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
