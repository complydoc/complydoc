import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** One idea per section: the heading on the left, what it means on the right, then the evidence. */
export function Section({ id, title, lead, children, className }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-14", className)}>
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <header className="mb-14 grid gap-6 md:grid-cols-2 md:gap-16">
          <div className="flex flex-col gap-4">
            <h2 id={`${id}-title`} className="text-3xl font-medium tracking-tight text-balance md:text-4xl">
              {title}
            </h2>
          </div>
          {lead && <p className="text-lg text-pretty text-muted-foreground md:pt-1">{lead}</p>}
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
