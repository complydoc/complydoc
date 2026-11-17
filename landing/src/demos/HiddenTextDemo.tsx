import { ScanEyeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { HIDDEN_DEMO, type HiddenCase, demoImage } from "@/demos/data";
import { cn } from "@/lib/utils";

const CV = HIDDEN_DEMO.cases[0] as HiddenCase;

/** A CV that looks clean, the text a loader hands the model, and a switch that shows the difference. */
export function HiddenTextDemo() {
  const [revealed, setRevealed] = useState(false);
  const mark = useRef<HTMLElement>(null);
  const box = CV.boxes[0];

  // Bring the hidden passage into view inside the text panel, not the page.
  useEffect(() => {
    const target = mark.current;
    const viewport = target?.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!target || !viewport) return;
    const top = revealed ? target.offsetTop - viewport.clientHeight / 3 : 0;
    viewport.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [revealed]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{CV.file}</span>, as a person sees it and as the model reads it
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <ScanEyeIcon aria-hidden className="size-4 text-primary" />
          Reveal
          <Switch checked={revealed} onCheckedChange={setRevealed} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <figure className="relative hidden self-start overflow-hidden rounded-lg border bg-white sm:block">
          <img
            src={demoImage(CV.image)}
            width={CV.width}
            height={CV.height}
            alt={`${CV.file}: a one-page CV that looks clean`}
            className="h-auto w-full"
          />
          {revealed && (
            <>
              {box && (
                <span
                  aria-hidden
                  className="absolute rounded-[2px] bg-destructive/30 ring-2 ring-destructive"
                  style={{
                    left: `${box.x * 100}%`,
                    top: `calc(${box.y * 100}% - 3px)`,
                    width: `max(${box.w * 100}%, 12px)`,
                    height: "7px",
                  }}
                />
              )}
            </>
          )}
        </figure>
        <ScrollArea className="h-56 rounded-lg border bg-muted/30">
          <pre className="p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
            {CV.model_text.before}
            <mark
              ref={mark}
              className={cn(
                "rounded-sm bg-transparent text-foreground transition-colors duration-500",
                revealed && "bg-destructive-soft",
              )}
            >
              {CV.model_text.hidden}
            </mark>
            {CV.model_text.after}
          </pre>
        </ScrollArea>
      </div>

      <div
        aria-live="polite"
        className={cn(
          "rounded-lg bg-muted/50 px-3 py-2 text-xs transition-opacity",
          !revealed && "opacity-60",
        )}
      >
        {revealed ? (
          <>
            <span>
              <span className="font-medium text-destructive">{sentence(CV.finding.severity)} severity.</span> Hidden
              by a font of {box?.size_pt} pt, {CV.finding.visibility}. Reads as an instruction:{" "}
              {CV.finding.instruction_reasons.join("; ")}.
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Look at the page. Then turn on Reveal.</span>
        )}
      </div>
    </div>
  );
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
