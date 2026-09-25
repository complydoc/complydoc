import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  id: string;
  /** A short mono label above the heading, such as "01 cost". */
  label: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** One idea per section, ruled off from the one before, as in the report. */
export function Section({ id, label, title, lead, children, className }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-14 border-t", className)}>
      <div className="mx-auto max-w-6xl border-x px-6 py-20 md:px-10">
        <header className="mb-12 grid gap-4 md:grid-cols-[12rem_1fr]">
          <p className="font-mono text-xs text-muted-foreground">{label}</p>
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight md:text-3xl">
              {title}
            </h2>
            {lead && <p className="text-base text-muted-foreground">{lead}</p>}
          </div>
        </header>
        {children}
      </div>
    </section>
  );
}

/** A link in running text. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
      {children}
    </a>
  );
}
