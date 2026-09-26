import { ModelPicker } from "@/components/ModelPicker";
import { usePlan } from "@/hooks/usePlan";

/**
 * The models every report is priced on, as the top bar chooses them, kept in
 * this browser. A report that did not price the model uses the cheapest it did
 * from the same provider.
 */
export function PreferredModels() {
  const { models, choice } = usePlan();
  if (models.length === 0) {
    return <p className="text-sm text-muted-foreground">This report priced no models.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid max-w-xl grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3 text-sm">
        <span className="text-muted-foreground">Text</span>
        <ModelPicker label="Preferred text model" models={models} value={choice.text} onChange={choice.chooseText} />
        <span className="text-muted-foreground">Pages as images</span>
        <ModelPicker
          label="Preferred vision model"
          models={models}
          value={choice.vision}
          onChange={choice.chooseVision}
          visionOnly
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Every report you open in this browser is priced on these. Where a report did not price one, it uses the cheapest
        model it did from the same provider.
      </p>
    </div>
  );
}
