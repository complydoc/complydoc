import { cn } from "@/lib/utils";
import { LOGOS, type Brand } from "@/lib/logos";

/** A company's mark at the size of the text beside it, unless a size class is given. */
export function BrandLogo({ brand, className }: { brand: Brand; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-4 shrink-0 [&>svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: LOGOS[brand] }}
    />
  );
}
