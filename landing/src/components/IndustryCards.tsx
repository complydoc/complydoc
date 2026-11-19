import { IndustryPhoto } from "@/components/IndustryPhoto";
import { cn } from "@/lib/utils";
import { INDUSTRIES, industryPath } from "@/pages/industries";

/** A card for each industry page: its photo and its name, as an index. */
export function IndustryCards({ home, except }: { home: string; except?: string }) {
  const shown = INDUSTRIES.filter((industry) => industry.slug !== except);
  return (
    <ul className={cn("grid gap-x-4 gap-y-10 sm:grid-cols-2", shown.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {shown.map((industry) => (
        <li key={industry.slug}>
          <a href={`${home}${industryPath(industry.slug)}`} data-page="" className="group flex flex-col gap-4">
            <IndustryPhoto industry={industry} className="aspect-[4/3] transition-opacity group-hover:opacity-90" />
            <div className="flex flex-col gap-1">
              <span className="text-lg font-medium">{industry.name}</span>
              <span className="text-pretty text-muted-foreground">{industry.headline}</span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
