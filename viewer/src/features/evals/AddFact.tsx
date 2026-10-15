import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ExpectedFact } from "@/report/evals";

const ANY = "__any__";

interface AddFactProps {
  /** The documents of the run, to say which one the passage must be in. */
  documents: string[];
  error: string | null;
  onAdd: (fact: ExpectedFact) => Promise<boolean>;
}

/** Add a passage a reading must contain: paste it as the document writes it. */
export function AddFact({ documents, error, onAdd }: AddFactProps) {
  const [text, setText] = useState("");
  const [document, setDocument] = useState(ANY);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const added = await onAdd({ text, document: document === ANY ? null : document });
    setSaving(false);
    if (added) setText("");
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Textarea
        required
        rows={2}
        aria-label="A passage a reading must contain"
        placeholder="Paste a passage as the document writes it: a total, a clause, a row of a table."
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
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
        <Button type="submit" size="sm" disabled={saving || text.trim().length < 3}>
          Expect it
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}
