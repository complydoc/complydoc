import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  /** Something short beside the title, such as a count. */
  aside?: ReactNode;
  children: ReactNode;
}

/** A clearly separated part of a page, with one heading. */
export function Section({ title, aside, children }: SectionProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      {/* A wide control beside the title goes under it, rather than squeezing it to a word a line. */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="shrink-0 font-heading text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        {aside && <span className="max-w-full min-w-0 text-xs text-muted-foreground">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/** Sections one under another, kept apart by space alone. */
export function SectionStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-10">{children}</div>;
}
