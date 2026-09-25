import { AspectRatio } from "@/components/ui/aspect-ratio";
import { cn } from "@/lib/utils";

interface ScreenshotProps {
  src: string;
  alt: string;
  /** Width over height of the picture. The viewer's screenshots are 16:10. */
  ratio?: number;
  className?: string | undefined;
}

/** A screenshot of the viewer, in a hairline frame, loaded when it comes near the screen. */
export function Screenshot({ src, alt, ratio = 16 / 10, className }: ScreenshotProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
      <AspectRatio ratio={ratio}>
        <img src={src} alt={alt} loading="lazy" decoding="async" className="size-full object-cover object-top-left" />
      </AspectRatio>
    </div>
  );
}
