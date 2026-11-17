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
  children,
}: {
  eyebrow: string;
  title: string;
  lead: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section id="top" aria-labelledby="page-title">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-16 pb-16 md:pt-24 md:pb-20">
        <p className="text-sm font-medium text-primary">{eyebrow}</p>
        <h1 id="page-title" className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          {title}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">{lead}</p>
        {children}
      </div>
    </section>
  );
}
