import { ArrowRightIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { HUE_TEXT, type Hue } from "@/components/hues";

/** One headline figure that opens what it counts. */
export function LinkStat({
  href,
  label,
  value,
  note,
  icon: Icon,
  hue,
}: {
  href: string;
  label: string;
  value: ReactNode;
  note?: string;
  icon: LucideIcon;
  hue: Hue;
}) {
  return (
    <a
      href={href}
      className="group px-5 py-1 transition-colors first:pl-0 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex flex-col gap-1.5">
        <span className="caps flex items-center gap-1.5">
          <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", HUE_TEXT[hue])} />
          <span className="flex-1">{label}</span>
          <ArrowRightIcon className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="figure text-2xl leading-none font-medium">{value}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
    </a>
  );
}

export function SeeAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      {children}
      <ArrowRightIcon className="size-3.5" />
    </a>
  );
}

