import { PlayIcon } from "lucide-react";
import { useRef, useState } from "react";
import poster from "@/assets/video/complydoc-poster.webp";
import video from "@/assets/video/complydoc.mp4";

/**
 * The product video on a soft brand backdrop: a still and a play button until it is
 * asked for, then the video itself, with sound and its own controls.
 */
export function ShowcaseVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = () => {
    setPlaying(true);
    void ref.current?.play();
  };

  return (
    <div className="showcase-backdrop rounded-2xl border p-3 sm:p-8 md:p-14">
      <div className="relative overflow-hidden rounded-xl border bg-card shadow-sm">
        <video
          ref={ref}
          src={video}
          poster={poster}
          preload="none"
          playsInline
          controls={playing}
          className="aspect-video w-full"
          aria-label="complydoc in 36 seconds: documents dropped in, their extraction readiness, every page routed to the cheapest reader that reads it well, and a hidden prompt injection flagged"
        />
        {!playing && (
          <button
            type="button"
            onClick={play}
            aria-label="Play the video"
            className="absolute inset-0 grid place-items-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="grid size-16 place-items-center rounded-full bg-foreground/80 text-background backdrop-blur transition-transform hover:scale-105 md:size-20">
              <PlayIcon className="ml-1 size-7 fill-current md:size-8" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
