/**
 * Severity and confidence as shapes, the way Linear shows priority and status:
 * one quiet colour, and a glyph that fills as the level rises. A table of them
 * reads at a glance without a column of coloured badges competing with the rest.
 * Each carries its word for a screen reader and in a tooltip.
 */
import { EVIDENCE } from "@/report/select";
import type { Evidence, Severity } from "@/report/types";
import { cn } from "@/lib/utils";

const FILLED: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const BARS = [
  { x: 1.5, height: 5 },
  { x: 6.5, height: 9 },
  { x: 11.5, height: 13 },
];

/** Three bars of rising height, as many filled as the severity is high. */
export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const label = `${severity[0]?.toUpperCase()}${severity.slice(1)} severity`;
  return (
    <span title={label} className={cn("inline-flex items-center", className)}>
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        {BARS.map((bar, index) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={14.5 - bar.height}
            width={3}
            height={bar.height}
            rx={1}
            className={index < FILLED[severity] ? "fill-foreground" : "fill-foreground/20"}
          />
        ))}
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

const SHARE: Record<Evidence, number> = { confirmed: 1, corroborated: 0.75, pattern: 0.5, model: 0 };

/** The inside of the ring filled from twelve o'clock, clockwise, by `share`. */
function pie(share: number): string {
  const angle = share * 2 * Math.PI;
  const x = 8 + 4 * Math.sin(angle);
  const y = 8 - 4 * Math.cos(angle);
  return `M8 8 L8 4 A4 4 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
}

/**
 * How sure complydoc is, as a ring that fills: whole and ticked when a check
 * proved it, three quarters when a label beside it agrees, half on its shape
 * alone, and a broken ring when only a model thinks so.
 */
export function EvidenceIcon({ evidence, className }: { evidence: Evidence; className?: string }) {
  const label = EVIDENCE.find((e) => e.key === evidence)?.label ?? evidence;
  const share = SHARE[evidence];
  return (
    <span title={label} className={cn("inline-flex items-center", className)}>
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
        {share === 1 ? (
          <>
            <circle cx={8} cy={8} r={7} className="fill-foreground" />
            <path
              d="M5 8.2 7.1 10.3 11 6.1"
              fill="none"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-background"
            />
          </>
        ) : (
          <>
            <circle
              cx={8}
              cy={8}
              r={6.25}
              fill="none"
              strokeWidth={1.5}
              className="stroke-foreground/70"
              {...(share === 0 && { strokeDasharray: "2.2 2" })}
            />
            {share > 0 && <path d={pie(share)} className="fill-foreground/70" />}
          </>
        )}
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
