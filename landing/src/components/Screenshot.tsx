import { AspectRatio } from "@/components/ui/aspect-ratio";
import { cn } from "@/lib/utils";

interface ScreenshotProps {
  /** One picture, or one for each theme, shown as the page's theme is. */
  src: string | { dark: string; light: string };
  alt: string;
  /** Width over height of the picture. The viewer's screenshots are 16:10. */
  ratio?: number;
  className?: string | undefined;
}

/** A screenshot of the viewer, in a hairline frame, loaded when it comes near the screen. */
export function Screenshot({ src, alt, ratio = 16 / 10, className }: ScreenshotProps) {
  const image = "size-full object-cover object-top-left";
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
      <AspectRatio ratio={ratio}>
        {typeof src === "string" ? (
          <img src={src} alt={alt} loading="lazy" decoding="async" className={image} />
        ) : (
          <>
            {/* A hidden picture is not fetched: each reader loads the one for their theme. */}
            <img src={src.light} alt={alt} loading="lazy" decoding="async" className={cn(image, "dark:hidden")} />
            <img src={src.dark} alt={alt} loading="lazy" decoding="async" className={cn(image, "hidden dark:block")} />
          </>
        )}
      </AspectRatio>
    </div>
  );
}
