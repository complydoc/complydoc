import { IndustryCarousel } from "@/components/IndustryCarousel";

/** The industry pages, as a row of photos under one centred heading. */
export function Industries({ home = "", except }: { home?: string; except?: string | undefined }) {
  return (
    <section id="industries" aria-labelledby="industries-title" className="scroll-mt-14 overflow-hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-6 py-24 md:py-32">
        <header className="flex flex-col items-center gap-4 text-center">
          <h2 id="industries-title" className="max-w-3xl text-3xl font-medium tracking-tight text-balance md:text-5xl">
            For the documents your industry runs on
          </h2>
          <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
            Contracts, referral letters, statements, claims and CVs. Each page shows what Veil covers and what it keeps.
          </p>
        </header>
        <IndustryCarousel home={home} except={except} />
      </div>
    </section>
  );
}
