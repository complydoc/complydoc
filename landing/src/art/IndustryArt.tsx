import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A drawing for each industry, in one style: thin ink lines on a flat panel, the brand blue for
 * one detail, and black bars where Veil covers a person's data.
 */

const INK = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A sheet of paper with lines of text, some of them covered. */
function Sheet({ x, y, w = 150, h = 200, rows }: { x: number; y: number; w?: number; h?: number; rows: (number | "bar")[] }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="6" className="fill-card" {...INK} />
      {rows.map((row, i) =>
        row === "bar" ? (
          <rect key={i} x={x + 20} y={y + 34 + i * 22 - 6} width={w * 0.5} height="12" rx="2" fill="currentColor" />
        ) : (
          <path key={i} d={`M${x + 20} ${y + 34 + i * 22}h${(w - 40) * row}`} {...INK} strokeWidth={2} opacity={0.45} />
        ),
      )}
    </g>
  );
}

const DRAWINGS: Record<string, ReactNode> = {
  legal: (
    <>
      <Sheet x={140} y={50} rows={["bar", 1, 0.8, 1, 0.6, "bar", 0.9]} />
      <path d="M160 222c10-10 18 6 28-4s14-8 22 0" {...INK} />
      <circle cx="262" cy="222" r="18" fill="var(--primary)" />
      <path d="M254 222l6 6 10-12" {...INK} stroke="var(--primary-foreground)" />
    </>
  ),
  healthcare: (
    <>
      <rect x="135" y="40" width="160" height="220" rx="10" className="fill-card" {...INK} />
      <rect x="185" y="30" width="60" height="22" rx="6" className="fill-card" {...INK} />
      <path d="M215 90v36M197 108h36" {...INK} stroke="var(--primary)" strokeWidth={8} />
      <rect x="160" y="150" width="80" height="12" rx="2" fill="currentColor" />
      <path d="M160 180h110M160 202h90M160 224h104" {...INK} strokeWidth={2} opacity={0.45} />
    </>
  ),
  finance: (
    <>
      <Sheet x={110} y={60} w={140} h={190} rows={[1, "bar", 0.7, 1, 0.5, 0.9]} />
      <rect x="200" y="140" width="130" height="84" rx="10" {...INK} fill="var(--primary)" />
      <path d="M200 162h130" {...INK} strokeWidth={10} />
      <rect x="214" y="190" width="70" height="10" rx="2" fill="currentColor" />
    </>
  ),
  insurance: (
    <>
      <Sheet x={210} y={50} w={130} h={180} rows={["bar", 1, 0.7, "bar", 0.8]} />
      <path d="M70 210h130M84 210l14-34h64l20 34" {...INK} />
      <circle cx="100" cy="214" r="14" className="fill-card" {...INK} />
      <circle cx="176" cy="214" r="14" className="fill-card" {...INK} />
      <path d="M112 182h40" {...INK} stroke="var(--primary)" strokeWidth={6} />
    </>
  ),
  hr: (
    <>
      <rect x="130" y="40" width="170" height="220" rx="8" className="fill-card" {...INK} />
      <circle cx="175" cy="90" r="24" fill="currentColor" />
      <rect x="210" y="76" width="70" height="12" rx="2" fill="currentColor" />
      <path d="M210 102h50" {...INK} strokeWidth={2} opacity={0.45} />
      <path d="M152 140h126M152 162h100M152 184h116" {...INK} strokeWidth={2} opacity={0.45} />
      <path d="M152 216h40" {...INK} stroke="var(--primary)" strokeWidth={6} />
      <path d="M200 216h40" {...INK} strokeWidth={6} opacity={0.2} />
    </>
  ),
};

/** The panel behind each drawing: flat tints from the brand's colours, no gradients. */
const PANELS: Record<string, string> = {
  legal: "bg-primary-soft",
  healthcare: "bg-muted",
  finance: "bg-[color-mix(in_oklab,var(--blush)_18%,var(--background))]",
  insurance: "bg-muted",
  hr: "bg-primary-soft",
};

export function IndustryArt({ slug, className }: { slug: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center overflow-hidden rounded-2xl text-foreground", PANELS[slug] ?? "bg-muted", className)}>
      <svg viewBox="0 0 430 300" className="h-[78%] w-auto" aria-hidden>
        {DRAWINGS[slug]}
      </svg>
    </div>
  );
}
