import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Footer } from "@/sections/Footer";
import { Nav } from "@/sections/Nav";

/** A page in a folder of its own, one level below the landing page. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <Nav home="../" />
      <main>{children}</main>
      <Footer home="../" />
    </TooltipProvider>
  );
}

/** The top of a page: what it is for, in a heading and a line or two. */
export function PageHeader({
  eyebrow,
  title,
  lead,
  art,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: ReactNode;
  /** A drawing beside the heading on a wide screen. */
  art?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section id="top" aria-labelledby="page-title" className="overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 pt-16 pb-16 md:pt-24 md:pb-20 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
          <h1 id="page-title" className="max-w-3xl text-4xl font-medium tracking-tight text-balance md:text-5xl">
            {title}
          </h1>
          <p className="max-w-2xl text-lg text-pretty text-muted-foreground">{lead}</p>
          {children && <div className="mt-4">{children}</div>}
        </div>
        {art && <div className="hidden justify-center lg:flex">{art}</div>}
      </div>
    </section>
  );
}
