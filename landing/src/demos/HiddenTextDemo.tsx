import { ScanEyeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { HIDDEN_DEMO, type HiddenCase, demoImage } from "@/demos/data";
import { cn } from "@/lib/utils";

const FIRST = HIDDEN_DEMO.cases[0] as HiddenCase;

const VISIBILITY: Record<string, string> = {
  confirmed: "Confirmed: the file says why it is not seen",
  suspected: "Suspected: nothing is drawn where the text is",
};

/** A page that looks clean, the text a loader hands the model, and a switch that shows the difference. */
export function HiddenTextDemo() {
  const [caseId, setCaseId] = useState(FIRST.id);
  const [revealed, setRevealed] = useState(false);
  const current = HIDDEN_DEMO.cases.find((c) => c.id === caseId) ?? FIRST;
  const mark = useRef<HTMLElement>(null);

  // Bring the hidden passage into view inside the text panel, not the page.
  useEffect(() => {
    const target = mark.current;
    const viewport = target?.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!target || !viewport) return;
    const top = revealed ? target.offsetTop - viewport.clientHeight / 3 : 0;
    viewport.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [revealed, current.id]);

  const last = current.boxes[current.boxes.length - 1];

  return (
    <div className="flex flex-col gap-6 rounded-3xl border bg-muted/50 p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div role="radiogroup" aria-label="Document" className="flex flex-wrap gap-2">
          {HIDDEN_DEMO.cases.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.id === current.id}
              onClick={() => {
                setCaseId(option.id);
                setRevealed(false);
              }}
              className={cn(
                "rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50",
                option.id === current.id && "border-primary bg-primary text-primary-foreground hover:border-primary",
              )}
            >
              {option.title}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium shadow-sm">
          <ScanEyeIcon aria-hidden className="size-4 text-primary" />
          Show what the model reads
          <Switch checked={revealed} onCheckedChange={setRevealed} />
        </label>
      </div>

      <p className="text-sm text-pretty text-muted-foreground">
        {current.story}{" "}
        {!revealed && <span className="text-foreground">Look at the page. Can you see anything wrong with it?</span>}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <figure className="flex flex-col gap-2">
          <figcaption className="text-xs text-muted-foreground">
            {current.file}, page {current.page}, as a person sees it
          </figcaption>
          <div className="relative overflow-hidden rounded-xl border bg-white shadow-sm">
            <img
              src={demoImage(current.image)}
              width={current.width}
              height={current.height}
              alt={`${current.file}, page ${current.page}`}
              className={cn("h-auto w-full transition-[filter,opacity] duration-500", revealed && "opacity-60 grayscale")}
            />
            {revealed &&
              current.boxes.map((box, index) => (
                <span
                  key={index}
                  aria-hidden
                  className="absolute animate-in rounded-[3px] bg-destructive/25 ring-2 ring-destructive fade-in"
                  style={{
                    left: `${box.x * 100}%`,
                    // A line at half a point is thinner than a pixel: centre a box you can see on it.
                    top: `calc(${(box.y + box.h / 2) * 100}% - max(${(box.h * 100) / 2}%, 4px))`,
                    width: `max(${box.w * 100}%, 12px)`,
                    height: `max(${box.h * 100}%, 8px)`,
                  }}
                />
              ))}
            {revealed && last && (
              <p
                className="absolute right-[6%] animate-in rounded-lg border border-destructive bg-card p-3 text-xs leading-relaxed text-pretty text-foreground shadow-lg fade-in slide-in-from-top-1"
                style={{ left: `${last.x * 100}%`, top: `calc(${(last.y + last.h) * 100}% + 10px)` }}
              >
                <span className="mb-1 block font-medium text-destructive">
                  Hidden here
                  {current.boxes.some((b) => b.size_pt < 1) && `, at ${current.boxes[0]?.size_pt} pt`}
                </span>
                {current.finding.excerpt}
              </p>
            )}
          </div>
        </figure>

        <div className="flex min-w-0 flex-col gap-4">
          <figure className="flex flex-col gap-2">
            <figcaption className="text-xs text-muted-foreground">
              The same page as <span className="font-mono">PyPDFLoader</span> hands it to the model
            </figcaption>
            <ScrollArea className="h-72 rounded-xl border bg-card shadow-sm lg:h-80">
              <pre className="p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                {current.model_text.before}
                <mark
                  ref={mark}
                  className={cn(
                    "rounded-sm bg-transparent text-foreground transition-colors duration-500",
                    revealed && "bg-destructive-soft ring-1 ring-destructive",
                  )}
                >
                  {current.model_text.hidden}
                </mark>
                {current.model_text.after}
              </pre>
            </ScrollArea>
          </figure>

          <div
            className={cn(
              "flex flex-col gap-3 rounded-xl border bg-card p-4 transition-opacity duration-500",
              !revealed && "opacity-50",
            )}
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">What complydoc reports</p>
              <Badge variant={current.finding.severity === "high" ? "destructive" : "warning"}>
                {current.finding.severity} severity
              </Badge>
            </div>
            {revealed ? (
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted-foreground">Why it is hidden</dt>
                <dd>{current.finding.hidden_reasons.join(", ")}</dd>
                <dt className="text-muted-foreground">Visibility</dt>
                <dd>{VISIBILITY[current.finding.visibility] ?? current.finding.visibility}</dd>
                {current.finding.instruction_reasons.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Reads as an instruction</dt>
                    <dd>{current.finding.instruction_reasons.join("; ")}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Turn on the switch to see the finding.</p>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-pretty text-muted-foreground">
        The finding is <code className="font-mono">complydoc audit</code>'s, from complydoc {HIDDEN_DEMO.complydoc}, on
        these three files. The audit renders each page and compares it with the text layer, offline, so the document
        never leaves your machine.
      </p>
    </div>
  );
}
