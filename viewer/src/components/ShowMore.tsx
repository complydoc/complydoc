import { Button } from "@/components/ui/button";
import { formatCount } from "@/report/format";

/** The button under a list cut short, saying how many are left. */
export function ShowMore({ left, onMore, step = 50 }: { left: number; onMore: () => void; step?: number }) {
  if (left <= 0) return null;
  return (
    <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={onMore}>
      {left > step ? `Show ${formatCount(step)} more of ${formatCount(left)}` : `Show ${formatCount(left)} more`}
    </Button>
  );
}
