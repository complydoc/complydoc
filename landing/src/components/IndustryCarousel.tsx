import { useRef } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { IndustryArt } from "@/art/IndustryArt";
import { Button } from "@/components/ui/button";
import { PHOTOS } from "@/pages/industry-photos";
import { INDUSTRIES, industryPath } from "@/pages/industries";


/** Tall photo cards, one per industry page, in a row that scrolls sideways. */
export function IndustryCarousel({ home, except }: { home: string; except?: string | undefined }) {
  const row = useRef<HTMLUListElement>(null);
  const shown = INDUSTRIES.filter((industry) => industry.slug !== except);

  const step = (direction: 1 | -1) => {
    const list = row.current;
    const card = list?.firstElementChild as HTMLElement | null;
    if (!list || !card) return;
    list.scrollBy({ left: direction * (card.offsetWidth + 16), behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-8">
      <ul
        ref={row}
        className="-ml-6 mr-[calc(50%-50vw)] flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shown.map((industry) => {
          const photo = PHOTOS[industry.slug];
          return (
            <li key={industry.slug} className="w-[72vw] shrink-0 snap-start sm:w-[300px]">
              <a
                href={`${home}${industryPath(industry.slug)}`}
                data-page=""
                className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-muted"
              >
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                ) : (
                  <IndustryArt slug={industry.slug} className="absolute inset-0 rounded-none" />
                )}
                <span className="absolute inset-0 bg-black/25" aria-hidden />
                <span className="absolute inset-x-6 bottom-6 text-2xl leading-tight font-medium text-balance text-white">
                  {industry.name}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-center gap-3">
        <Button variant="outline" size="icon" className="size-11 rounded-full" onClick={() => step(-1)} aria-label="Previous industries">
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" size="icon" className="size-11 rounded-full" onClick={() => step(1)} aria-label="Next industries">
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
