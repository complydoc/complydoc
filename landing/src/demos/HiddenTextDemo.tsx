import { ScanEyeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
    <div className="flex flex-col gap-8 rounded-2xl border bg-muted/50 p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          value={current.id}
          onValueChange={(value) => {
            if (!value) return;
            setCaseId(value);
            setRevealed(false);
          }}
          aria-label="Document"
          className="flex-wrap"
        >
          {HIDDEN_DEMO.cases.map((option) => (
            <ToggleGroupItem key={option.id} value={option.id} className="bg-card px-4">
              {option.title}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label className="flex cursor-pointer items-center gap-4 rounded-lg border bg-card px-4 py-2 text-sm font-medium">
          <ScanEyeIcon aria-hidden className="size-4 text-primary" />
          Show what the model reads
          <Switch checked={revealed} onCheckedChange={setRevealed} />
        </label>
      </div>

      <p className="text-sm text-pretty text-muted-foreground">
        {current.story}{" "}
        {!revealed && <span className="text-foreground">Look at the page. Can you see anything wrong with it?</span>}
      </p>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-4">
        <figure className="flex flex-col gap-4">
          <figcaption className="text-xs text-muted-foreground">
            {current.file}, page {current.page}, as a person sees it
          </figcaption>
          <div className="relative overflow-hidden rounded-xl border bg-white">
            <img
              src={demoImage(current.image)}
              width={current.width}
              height={current.height}
              alt={`${current.file}, page ${current.page}`}
              className={cn("h-auto w-full transition-[filter,opacity] duration-500", revealed && "opacity-60 grayscale")}
            />
            {revealed &&
              current.boxes.map((box, index) => (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Hidden text: ${current.finding.excerpt}`}
                      className="absolute animate-in rounded-[3px] bg-destructive/25 ring-2 ring-destructive fade-in"
                      style={{
                        left: `${box.x * 100}%`,
                        // A line at half a point is thinner than a pixel: centre a box you can see on it.
                        top: `calc(${(box.y + box.h / 2) * 100}% - max(${(box.h * 100) / 2}%, 4px))`,
                        width: `max(${box.w * 100}%, 12px)`,
                        height: `max(${box.h * 100}%, 8px)`,
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    {box.size_pt < 1 ? `Set at ${box.size_pt} pt` : current.finding.hidden_reasons.join(", ")}
                  </TooltipContent>
                </Tooltip>
              ))}
            {revealed && last && (
              <div
                className="absolute right-[6%] flex animate-in flex-col gap-1 rounded-lg border border-destructive bg-card p-4 text-xs leading-relaxed text-pretty text-foreground fade-in slide-in-from-top-1"
                style={{ left: `${last.x * 100}%`, top: `calc(${(last.y + last.h) * 100}% + 12px)` }}
              >
                <span className="font-medium text-destructive">Hidden here</span>
                {current.finding.excerpt}
              </div>
            )}
          </div>
        </figure>

        <div className="flex min-w-0 flex-col gap-8">
          <figure className="flex flex-col gap-4">
            <figcaption className="text-xs text-muted-foreground">
              The same page as <span className="font-mono">PyPDFLoader</span> hands it to the model
            </figcaption>
            <ScrollArea className="h-72 rounded-xl border bg-card lg:h-80">
              <pre className="p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                {current.model_text.before}
                <mark
                  ref={mark}
                  className={cn(
                    "rounded-sm bg-transparent text-foreground transition-colors duration-500",
                    revealed && "bg-destructive-soft",
                  )}
                >
                  {current.model_text.hidden}
                </mark>
                {current.model_text.after}
              </pre>
            </ScrollArea>
          </figure>

          <Card aria-live="polite" className={cn("transition-opacity duration-500", !revealed && "opacity-60")}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                What complydoc reports
                <Badge variant={current.finding.severity === "high" ? "destructive" : "warning"}>
                  {current.finding.severity} severity
                </Badge>
              </CardTitle>
              {!revealed && <CardDescription>Turn on the switch to see the finding.</CardDescription>}
            </CardHeader>
            {revealed && (
              <CardContent>
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
              </CardContent>
            )}
          </Card>
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
