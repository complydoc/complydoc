import { useEffect, useRef, useSyncExternalStore } from "react";
import { useInView } from "@/hooks/useInView";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

interface Themed {
  dark: string;
  light: string;
}

interface RecordingProps {
  /** The recording, one for each theme. */
  video: Themed;
  /** Its first frame: shown until the recording loads, and in its place where motion is not wanted. */
  poster: Themed;
  /** What the recording shows, for a reader who cannot see it. */
  label: string;
  className?: string;
}

/**
 * A recording of the viewer, in a hairline frame, in the theme the page is showing. It loads
 * and plays once it comes on screen, loops without sound, and stays a still picture for
 * a reader who asked for less motion.
 */
/** Whether the page is showing its dark theme now, kept current as the reader switches. */
function useDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

export function Recording({ video, poster, label, className }: RecordingProps) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");
  const theme = useDark() ? "dark" : "light";
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={cn("aspect-[16/10] overflow-hidden rounded-xl border bg-card shadow-sm", className)}
    >
      {/* One clip, for the theme showing: the other is never fetched. Keyed, so a switch of theme starts the new one. */}
      <Clip key={theme} video={video[theme]} poster={poster[theme]} play={seen && !still} />
    </div>
  );
}

function Clip({ video, poster, play }: { video: string; poster: string; play: boolean }) {
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (play) void element.current?.play().catch(() => undefined);
  }, [play]);
  return (
    <video
      ref={element}
      src={play ? video : undefined}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
      className="size-full object-cover"
    />
  );
}
