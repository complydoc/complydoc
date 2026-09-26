import { useState } from "react";
import { SeverityIcon } from "@/components/LevelIcons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SEVERITIES } from "@/report/select";
import { conceptId } from "@/report/concepts";
import type { Concept, Severity } from "@/report/types";

/** What a pattern finds in some text, or why it cannot be used. Matched ignoring case, as a run matches it. */
function tryPattern(pattern: string, sample: string): { matches: string[] } | { error: string } {
  try {
    const expression = new RegExp(pattern, "gi");
    if (expression.test("")) return { error: "It matches empty text, so it would match everywhere." };
    return { matches: [...sample.matchAll(expression)].map((m) => m[0]) };
  } catch {
    return { error: "This is not a valid regular expression." };
  }
}

interface ConceptFormProps {
  initial?: Concept;
  /** Ids already in use, so a new concept gets one of its own. */
  taken: string[];
  onSave: (concept: Concept) => Promise<boolean>;
  onCancel: () => void;
  /** What the server said, when it refused. */
  error: string | null;
}

/** A concept described in words, with an optional pattern to try before saving it. */
export function ConceptForm({ initial, taken, onSave, onCancel, error }: ConceptFormProps) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pattern, setPattern] = useState(initial?.pattern ?? "");
  const [severity, setSeverity] = useState<Severity>(initial?.severity ?? "medium");
  const [judge, setJudge] = useState(initial?.judge ?? false);
  const [sample, setSample] = useState("");
  const [saving, setSaving] = useState(false);

  const tried = pattern.trim() ? tryPattern(pattern.trim(), sample) : null;
  const problem = !label.trim()
    ? "Give it a name."
    : !description.trim()
      ? "Say what it is."
      : tried && "error" in tried
        ? tried.error
        : !pattern.trim() && !judge
          ? "Give it a pattern, or have a model judge it, or nothing will find it."
          : null;

  const save = async () => {
    setSaving(true);
    const concept: Concept = {
      id: initial?.id ?? conceptId(label, taken),
      label: label.trim(),
      description: description.trim(),
      pattern: pattern.trim() || null,
      severity,
      judge,
    };
    const saved = await onSave(concept);
    setSaving(false);
    if (saved) onCancel();
  };

  return (
    <form
      aria-label={initial ? `Edit ${initial.label}` : "New concept"}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem) void save();
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Name</span>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tariff engine ID" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">What it is</span>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="An identifier from our insurance tariff engine, such as TE-2024-00012."
        />
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">
            Pattern <span className="font-normal text-muted-foreground">(optional, a regular expression)</span>
          </span>
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="TE-\d{4}-\d{5}"
            className="font-mono"
          />
        </label>
        {pattern.trim() && (
          <div className="flex flex-col gap-1.5">
            <Input
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder="Try it on some text"
              aria-label="Text to try the pattern on"
            />
            <p className="text-xs text-muted-foreground" role="status">
              {tried && "error" in tried
                ? tried.error
                : sample
                  ? tried && "matches" in tried && tried.matches.length > 0
                    ? `Finds ${tried.matches.map((m) => `“${m}”`).join(", ")}`
                    : "Finds nothing in this text."
                  : "Type some text to see what the pattern finds."}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Severity</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={severity}
          aria-label="Severity"
          onValueChange={(value) => value && setSeverity(value as Severity)}
          className="self-start"
        >
          {[...SEVERITIES].reverse().map((s) => (
            <ToggleGroupItem key={s} value={s}>
              <SeverityIcon severity={s} />
              {s[0]?.toUpperCase()}
              {s.slice(1)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox className="mt-0.5" checked={judge} onCheckedChange={(checked) => setJudge(checked === true)} />
        <span className="leading-5">
          Also have a model judge each page for it
          <span className="block text-xs text-muted-foreground">
            Finds it where no pattern can. On runs with <code>--judge-concepts jev</code> only, which send page text to
            TypeSafe.
          </span>
        </span>
      </label>
      {(problem ?? error) && <p className="text-sm text-destructive">{problem ?? error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={Boolean(problem) || saving}>
          {initial ? "Save" : "Add concept"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
