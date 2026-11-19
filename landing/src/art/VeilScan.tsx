import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** A piece of the document: plain text, or a value that belongs to a person or to the company. */
type Piece = string | { text: string; owner: "person" | "company"; kind: string; why: string };

/**
 * A tenancy contract, in Portuguese, as Veil 1 PT would read it. An illustration with made-up
 * people and numbers: Veil is in training and this is not its output.
 */
const DOCUMENT: Piece[][] = [
  [
    "Entre ",
    { text: "Lusitânia Imobiliária, Lda.", owner: "company", kind: "company", why: "the landlord" },
    ", NIPC ",
    { text: "512 345 678", owner: "company", kind: "nipc", why: "a company number" },
    ", com sede na ",
    { text: "Rua Augusta 14, Lisboa", owner: "company", kind: "address", why: "the company's office" },
    ", e ",
    { text: "Maria Inês Carvalho", owner: "person", kind: "name", why: "signs as the tenant" },
    ", NIF ",
    { text: "234 567 891", owner: "person", kind: "tax no.", why: "the tenant's tax number" },
    ", residente na ",
    { text: "Rua do Almada 210, Porto", owner: "person", kind: "address", why: "where the tenant lives" },
    ", nascida a ",
    { text: "14/03/1988", owner: "person", kind: "birth date", why: "the tenant's birthday" },
    ".",
  ],
  [
    "A renda de 850 € é paga da conta ",
    { text: "PT50 0035 0123 0000 4567 8901 2", owner: "person", kind: "iban", why: "the tenant's own account" },
    " para a conta do senhorio, ",
    { text: "PT50 0010 0000 1234 5678 9015 4", owner: "company", kind: "iban", why: "the landlord's account" },
    ".",
  ],
  [
    "Contacto da arrendatária: ",
    { text: "m.carvalho@exemplo.pt", owner: "person", kind: "email", why: "the tenant's email" },
    ", ",
    { text: "+351 912 345 678", owner: "person", kind: "phone", why: "the tenant's phone" },
    ".",
  ],
];

/**
 * The same contract twice, one layer over the other, cut by a line the reader can drag:
 * to the left of it, what the model receives; to the right, the original.
 */
export function VeilScan() {
  const frame = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(58);
  const [held, setHeld] = useState(false);
  const [touched, setTouched] = useState(false);
  const [judge, setJudge] = useState(true);

  // Until the reader takes the line, it sweeps slowly across the page on its own.
  useEffect(() => {
    if (touched || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = (now - start) / 1000;
      setAt(50 + 40 * Math.sin(t * 0.55 + 0.2));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [touched]);

  const moveTo = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setAt(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
  };
  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    setTouched(true);
    setHeld(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (held) moveTo(event.clientX);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowLeft" ? -4 : event.key === "ArrowRight" ? 4 : 0;
    if (!delta) return;
    event.preventDefault();
    setTouched(true);
    setAt((value) => Math.min(100, Math.max(0, value + delta)));
  };

  return (
    <figure className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-sm text-muted-foreground">
        <span>What the model reads</span>
        <span className="flex items-center gap-2">
          <Switch id="veil-judge" checked={judge} onCheckedChange={setJudge} />
          <Label htmlFor="veil-judge" className="font-normal text-foreground">
            Veil Judge
          </Label>
        </span>
        <span className="text-right">The original</span>
      </div>
      <div
        ref={frame}
        role="slider"
        tabIndex={0}
        aria-label="Move the line between the veiled copy and the original"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(at)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => setHeld(false)}
        onKeyDown={onKey}
        className="relative cursor-ew-resize touch-none overflow-hidden rounded-2xl border bg-card outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sheet veiled={false} judge={judge} />
        <div className="absolute inset-0 bg-card" style={{ clipPath: `inset(0 ${100 - at}% 0 0)` }} aria-hidden>
          <Sheet veiled judge={judge} />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground" style={{ left: `${at}%` }} aria-hidden>
          <span className="absolute top-1/2 left-1/2 flex h-9 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full border bg-background">
            <span className="h-3 w-px bg-foreground" />
            <span className="h-3 w-px bg-foreground" />
          </span>
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-6 rounded-sm bg-foreground" aria-hidden />
          Veiled: it belongs to a person
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 bg-primary" aria-hidden />
          Kept: it belongs to the company
        </span>
        <span className="sm:ml-auto">An illustration with made-up data. Drag the line, point at a value.</span>
      </figcaption>
    </figure>
  );
}

/** The contract, as written or with each person's details covered. Without Veil Judge, the company's are covered too. */
function Sheet({ veiled, judge }: { veiled: boolean; judge: boolean }) {
  return (
    <div className="flex flex-col gap-5 p-6 font-mono text-[13px] leading-7 sm:p-10 sm:text-sm sm:leading-8">
      <p className="font-sans text-base font-medium">Contrato de arrendamento</p>
      {DOCUMENT.map((paragraph, p) => (
        <p key={p} className="text-pretty">
          {paragraph.map((piece, i) => {
            if (typeof piece === "string") return <span key={i}>{piece}</span>;
            const covered = veiled && (piece.owner === "person" || !judge);
            const kept = veiled && !covered;
            const span = (
              <span
                className={cn(
                  "relative inline-block rounded-[3px] leading-[1.45] whitespace-nowrap transition-colors",
                  covered && "bg-foreground text-transparent",
                  kept && "underline decoration-primary decoration-2 underline-offset-[6px]",
                )}
              >
                {piece.text}
                {covered && (
                  <span className="absolute inset-0 flex items-center overflow-hidden pl-2 text-[10px] leading-none text-background">
                    {piece.kind}
                  </span>
                )}
              </span>
            );
            if (!veiled) return <span key={i}>{span}</span>;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>{span}</TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {judge
                    ? `${piece.kind}, ${piece.why}: ${piece.owner === "person" ? "a person, veiled" : "the company, kept"}`
                    : `${piece.kind}: veiled, no one asked whose it is`}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </p>
      ))}
    </div>
  );
}
