import { ArrowRightIcon, CheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FeatureRowProps {
  /** The step of the loop this feature belongs to, above the title. */
  label: string;
  title: string;
  children: ReactNode;
  /** Two or three things it does, said in a line each. */
  points: string[];
  more: { label: string; href: string };
  /** What the feature looks like, set in the tinted half. */
  visual: ReactNode;
  /** Put the visual on the left, so rows alternate down the page. */
  flip?: boolean;
}

/** One feature: what it is in a few lines on one side, and the thing itself on the other. */
export function FeatureRow({ label, title, children, points, more, visual, flip = false }: FeatureRowProps) {
  return (
    <article
      className={cn(
        "grid overflow-hidden rounded-3xl border bg-muted/50 *:min-w-0",
        flip ? "lg:grid-cols-[6fr_5fr]" : "lg:grid-cols-[5fr_6fr]",
      )}
    >
      <div className="flex flex-col justify-center gap-4 p-8 md:p-12">
        <p className="font-mono text-xs tracking-wide text-primary uppercase">{label}</p>
        <h3 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{title}</h3>
        <p className="text-pretty text-muted-foreground">{children}</p>
        <ul className="flex flex-col gap-2 text-sm">
          {points.map((point) => (
            <li key={point} className="flex gap-2">
              <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              {point}
            </li>
          ))}
        </ul>
        <a
          href={more.href}
          className="flex w-fit items-center gap-1.5 text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
        >
          {more.label}
          <ArrowRightIcon className="size-4" />
        </a>
      </div>
      <div className={cn("flex items-center bg-success-soft p-6 md:p-10", flip && "lg:order-first")}>
        <div className="w-full">{visual}</div>
      </div>
    </article>
  );
}
