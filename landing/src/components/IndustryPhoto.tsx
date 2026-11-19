import { cn } from "@/lib/utils";
import type { Industry } from "@/pages/industries";

/** The industry's photo, on a plain panel that shows while it loads or if it cannot. */
export function IndustryPhoto({ industry, className }: { industry: Industry; className?: string }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-2xl bg-muted", className)}>
      {industry.photo && (
        <img src={industry.photo.src} alt="" loading="lazy" className="size-full object-cover" />
      )}
    </div>
  );
}
