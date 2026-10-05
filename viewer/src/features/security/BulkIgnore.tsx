import { CopyIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useIgnores } from "@/hooks/useIgnores";
import { copyWithToast, toast } from "@/lib/toast";
import { plural } from "@/report/format";
import type { FindingRow } from "@/report/security";

/**
 * What can be done with several findings at once: set them all aside for one reason, or
 * copy their fingerprints for `complydoc ignore`.
 */
export function BulkIgnore({ rows, onDone }: { rows: FindingRow[]; onDone: () => void }) {
  const { ignore, error } = useIgnores();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const findable = rows.filter((row) => row.source.fingerprint);

  const save = async () => {
    setSaving(true);
    let done = 0;
    for (const row of findable) {
      const finding = row.source.fingerprint as string;
      if (await ignore({ finding, reason, what: `${row.label} ${row.masked}` }, { quiet: true })) done += 1;
    }
    setSaving(false);
    if (done > 0) {
      toast(`${plural(done, "finding")} ignored`);
      setOpen(false);
      setReason("");
      onDone();
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" disabled={findable.length === 0}>
            <EyeOffIcon />
            Ignore…
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" side="top" className="w-80">
          <PopoverHeader>
            <PopoverTitle>Ignore {plural(findable.length, "finding")}</PopoverTitle>
            <PopoverDescription>
              Each stays in the report, marked ignored with this reason, and leaves every count and every check.
            </PopoverDescription>
          </PopoverHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              Why they are not a problem
              <Textarea
                required
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Our own company's details, printed on every letter."
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving || !reason.trim()}>
              Ignore {plural(findable.length, "finding")}
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="sm"
        disabled={findable.length === 0}
        onClick={() =>
          copyWithToast(
            findable.map((row) => row.source.fingerprint).join("\n"),
            plural(findable.length, "fingerprint"),
          )
        }
      >
        <CopyIcon />
        Copy fingerprints
      </Button>
    </>
  );
}
