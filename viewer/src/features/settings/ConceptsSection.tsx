import { PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { SeverityIcon } from "@/components/LevelIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import type { ConceptsState } from "@/hooks/useConcepts";
import type { ConceptRule } from "@/report/types";
import { ConceptForm } from "./ConceptForm";

interface ConceptsSectionProps {
  state: ConceptsState;
  /** The concepts as the run on screen looked for them, with how often each was found. */
  lastRun: ConceptRule[];
}

function lastRunNote(id: string, lastRun: ConceptRule[]): string {
  const seen = lastRun.find((c) => c.id === id);
  if (!seen) return "Added since this run";
  const byPattern = seen.found ? `found ${seen.found} ${seen.found === 1 ? "time" : "times"}` : null;
  const byModel = seen.judged ? `on ${seen.judged} ${seen.judged === 1 ? "page" : "pages"} by a model` : null;
  const found = [byPattern, byModel].filter(Boolean).join(", and ");
  return found ? `${found[0]?.toUpperCase()}${found.slice(1)} on this run` : "Found nothing on this run";
}

/** Your own things to look for: each described, how it is found, and how often it was. */
export function ConceptsSection({ state, lastRun }: ConceptsSectionProps) {
  const { editable, concepts, error, save, remove } = state;
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const taken = concepts.map((c) => c.id);

  return (
    <div className="flex flex-col gap-3">
      {concepts.length === 0 && editing !== "new" && (
        <p className="text-sm text-muted-foreground">
          Nothing of your own yet. Describe something your documents carry, such as a policy or case reference, and
          every run will look for it and mask it like any identifier.
        </p>
      )}
      <ItemGroup aria-label="Your concepts">
        {concepts.map((concept) =>
          editing === concept.id ? (
            <ConceptForm
              key={concept.id}
              initial={concept}
              taken={taken}
              onSave={save}
              onCancel={() => setEditing(null)}
              error={error}
            />
          ) : (
            <Item key={concept.id} role="listitem" variant="outline" size="sm" className="bg-card">
              <ItemContent>
                <ItemTitle className="flex-wrap">
                  <SeverityIcon severity={concept.severity} />
                  {concept.label}
                  {concept.judge && (
                    <Badge variant="secondary">
                      <SparklesIcon />
                      Judged by a model
                    </Badge>
                  )}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">{concept.description}</ItemDescription>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {concept.pattern ? <code className="font-mono">{concept.pattern}</code> : <span>No pattern</span>}
                  <span>{lastRunNote(concept.id, lastRun)}</span>
                </p>
              </ItemContent>
              {editable && (
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${concept.label}`}
                    onClick={() => setEditing(concept.id)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${concept.label}`}
                    onClick={() => void remove(concept.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </ItemActions>
              )}
            </Item>
          ),
        )}
      </ItemGroup>
      {editable &&
        (editing === "new" ? (
          <ConceptForm taken={taken} onSave={save} onCancel={() => setEditing(null)} error={error} />
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing("new")}>
            <PlusIcon />
            Add a concept
          </Button>
        ))}
    </div>
  );
}
