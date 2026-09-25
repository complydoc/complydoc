import { CheckIcon, ChevronsUpDownIcon, EyeIcon } from "lucide-react";
import { useState } from "react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import { providerName } from "@/report/cost";
import { byProvider, perMillion, type PricedModel } from "@/report/pricing";

interface ModelPickerProps {
  /** What the choice is for, as a screen reader names the button. */
  label: string;
  models: PricedModel[];
  value: PricedModel | null;
  onChange: (id: string) => void;
  /** List only models that take images. */
  visionOnly?: boolean;
}

/** A button naming the chosen model, opening a searchable list of every model the run priced, by provider. */
export function ModelPicker({ label, models, value, onChange, visionOnly = false }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const shown = visionOnly ? models.filter((m) => m.vision) : models;

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <Button variant="outline" size="sm" aria-label={label} className="max-w-64 justify-between gap-2">
          {visionOnly && <EyeIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />}
          {value ? (
            <>
              <ModelSelectorLogo provider={value.provider} className="size-3.5" />
              <ModelSelectorName>{value.name}</ModelSelectorName>
            </>
          ) : (
            <ModelSelectorName className="text-muted-foreground">No priced model</ModelSelectorName>
          )}
          <ChevronsUpDownIcon className="size-3.5 opacity-50" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent title={label}>
        <ModelSelectorInput placeholder={visionOnly ? "Search vision models…" : "Search models…"} />
        <ModelSelectorList>
          <ModelSelectorEmpty>No model matches.</ModelSelectorEmpty>
          {byProvider(shown).map(([provider, group]) => (
            <ModelSelectorGroup key={provider} heading={providerName(provider)}>
              {group.map((model) => (
                <ModelSelectorItem
                  key={model.id}
                  // What the search box matches against.
                  value={`${model.name} ${providerName(provider)} ${model.id}`}
                  onSelect={() => {
                    onChange(model.id);
                    setOpen(false);
                  }}
                >
                  <ModelSelectorLogo provider={model.provider} />
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                  {model.vision && <EyeIcon aria-label="takes images" className="size-3.5 text-muted-foreground" />}
                  <span className="text-xs tabular-nums text-muted-foreground">{perMillion(model)}</span>
                  <CheckIcon className={model.id === value?.id ? "size-4" : "size-4 opacity-0"} />
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
