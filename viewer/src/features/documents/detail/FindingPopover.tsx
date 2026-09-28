import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { PageFinding } from "@/report/pageFindings";
import { FindingBody } from "./FindingBody";

interface FindingPopoverProps {
  finding: PageFinding | null;
  /** Where the finding's text is on screen, to open beside. */
  rect: DOMRect | null;
  onClose: () => void;
  /** The pointer came onto the card, or left it: a card opened by hovering stays while it is used. */
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

/**
 * A finding rested on in the text: what it is, how sure complydoc is, and a box to
 * tick it off as not a problem.
 */
export function FindingPopover({ finding, rect, onClose, onPointerEnter, onPointerLeave }: FindingPopoverProps) {
  const open = finding !== null && rect !== null;
  // The popover opens beside the text it is about, which is no element of its own.
  const anchor = { current: { getBoundingClientRect: () => rect ?? new DOMRect() } };

  return (
    <Popover open={open} onOpenChange={(next) => !next && onClose()}>
      <PopoverAnchor virtualRef={anchor} />
      {finding && (
        <PopoverContent
          align="start"
          className="w-80"
          onOpenAutoFocus={(event) => event.preventDefault()}
          {...(onPointerEnter && { onPointerEnter })}
          {...(onPointerLeave && { onPointerLeave })}
        >
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">{finding.label}</span>
            <FindingBody finding={finding} />
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
