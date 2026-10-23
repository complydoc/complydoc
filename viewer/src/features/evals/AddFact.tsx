import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ExpectedFact } from "@/report/evals";
import type { FactKind } from "@/report/types";

const ANY = "__any__";

const KINDS: Record<FactKind, { name: string; says: string; placeholder: string }> = {
  text: {
    name: "Passage",
    says: "A passage a reading must contain",
    placeholder: "Paste a passage as the document writes it: a clause, a heading, a row of a table.",
  },
  value: {
    name: "Value",
    says: "A number a reading must contain",
    placeholder: "Written any way: 78,500.00, 78.500,00 and 78 500,00 count as the same amount.",
  },
  absent: {
    name: "Must not appear",
    says: "A passage a reading must not contain",
    placeholder: "Text a reading should leave out: hidden instructions, a watermark, a repeated footer.",
  },
};

interface AddFactProps {
  /** The documents of the run, to say which one the passage must be in. */
  documents: string[];
  error: string | null;
  onAdd: (fact: ExpectedFact) => Promise<boolean>;
}

/**
 * Add what a reading must hold: a passage as the document writes it, a value however it is
 * grouped, or a passage it must leave out.
 */
export function AddFact({ documents, error, onAdd }: AddFactProps) {
  const [kind, setKind] = useState<FactKind>("text");
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [document, setDocument] = useState(ANY);
  const [saving, setSaving] = useState(false);
  const shown = KINDS[kind];
  const ready = kind === "value" ? /\d/.test(text) : text.trim().length >= 3;

  const save = async () => {
    setSaving(true);
    const added = await onAdd({
      text,
      kind,
      label: kind === "value" && label.trim() ? label : null,
      document: document === ANY ? null : document,
    });
    setSaving(false);
    if (added) {
      setText("");
      setLabel("");
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={kind}
        aria-label="What to expect"
        className="self-start"
        onValueChange={(value) => value && setKind(value as FactKind)}
      >
        {(Object.keys(KINDS) as FactKind[]).map((k) => (
          <ToggleGroupItem key={k} value={k}>
            {KINDS[k].name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {kind === "value" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="The words the value comes after"
              placeholder="After the words (optional): Total due"
              className="min-w-48 flex-1"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <Input
              required
              aria-label={shown.says}
              placeholder="78,500.00"
              className="w-40"
              inputMode="decimal"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">{shown.placeholder}</p>
        </div>
      ) : (
        <Textarea
          required
          rows={2}
          aria-label={shown.says}
          placeholder={shown.placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={document} onValueChange={setDocument}>
          <SelectTrigger size="sm" aria-label="The document it must be in" className="max-w-full min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ANY}>Any document</SelectItem>
              {documents.map((path) => (
                <SelectItem key={path} value={path}>
                  {path}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={saving || !ready}>
          Expect it
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}
