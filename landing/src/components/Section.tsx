import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  id: string;
  /** A short label above the heading. */
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** One idea per section, ruled off from the one before, as in the report. */
export function Section({ id, eyebrow, title, lead, children, className }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-14 border-t", className)}>
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <header className="mb-12 flex max-w-3xl flex-col gap-4">
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
          <h2 id={`${id}-title`} className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {title}
          </h2>
          {lead && <p className="text-lg text-pretty text-muted-foreground">{lead}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

/** A link in running text. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
      {children}
    </a>
  );
}
