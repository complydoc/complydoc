import { EvidenceIcon } from "@/components/LevelIcons";
import { ToneBadge } from "@/components/ToneBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EVIDENCE } from "@/report/select";
import type { Evidence, SensitiveMatch } from "@/report/types";
import { validationSteps } from "@/report/validation";

/**
 * How sure complydoc is of a finding, opening on how it was validated. With
 * `icon`, a ring that fills with the confidence instead of a coloured badge.
 */
export function EvidenceBadge({
  evidence,
  match,
  icon = false,
}: {
  evidence: Evidence;
  match?: SensitiveMatch | null;
  icon?: boolean;
}) {
  const grade = EVIDENCE.find((e) => e.key === evidence);
  if (!grade) return null;
  return (
    <Popover>
      <PopoverTrigger
        className="rounded-full focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={`${grade.label}: how this was validated`}
      >
        {icon ? <EvidenceIcon evidence={evidence} /> : <ToneBadge tone={grade.tone}>{grade.label}</ToneBadge>}
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm">
        <p className="font-medium">How this was validated</p>
        <p className="mt-1 text-muted-foreground">{grade.how}</p>
        {match && (
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-4">
            {validationSteps(match).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
