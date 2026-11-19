import { BrandLogo } from "@/components/BrandLogo";
import { Logo } from "@/components/Logo";
import type { Brand } from "@/lib/logos";

/**
 * A document's way to the models, drawn as a track: the router sends each page down the
 * cheapest lane that loses nothing, Veil covers people's data, and the gateway lets only the
 * clean text through to whatever model the team already uses. complydoc does not pick the model.
 * Pages travel as blue dots until Veil, and as ink dashes after it.
 */

const LANES = [
  { y: 80, label: "text layer" },
  { y: 180, label: "local OCR" },
  { y: 280, label: "vision" },
];

/** Examples of the model a team may already use. The gateway works the same in front of any of them. */
const BRANDS: Brand[] = ["claude", "openai", "gemini", "mistral"];

const IN = "M70 180H220";
const lane = (y: number) => `M340 180C400 180 400 ${y} 450 ${y}C500 ${y} 500 180 560 180`;
const THROUGH = "M680 180H760";
const OUT = "M880 180H950";

export function GatewayFlow() {
  return (
    <figure className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <svg viewBox="0 0 1170 360" className="min-w-[720px]" role="img" aria-label="A document goes through the router, Veil and the gateway, then to the model or tool you already use">
          {/* The track. */}
          <g fill="none" stroke="var(--border)" strokeWidth="1.5">
            <path d={IN} />
            {LANES.map((l) => (
              <path key={l.y} d={lane(l.y)} />
            ))}
            <path d={THROUGH} />
            <path d={OUT} />
          </g>

          {/* Pages before Veil: blue dots, raw. */}
          <g className="flow-motion" fill="var(--primary)">
            {[0, 1.1, 2.2].map((begin) => (
              <circle key={begin} r="4">
                <animateMotion dur="3.3s" begin={`${begin}s`} repeatCount="indefinite" path={IN} />
              </circle>
            ))}
            {LANES.map((l, i) => (
              <circle key={l.y} r="4">
                <animateMotion dur="3.3s" begin={`${i * 1.1 + 0.4}s`} repeatCount="indefinite" path={lane(l.y)} />
              </circle>
            ))}
          </g>
          {/* After Veil: ink dashes, the people's data covered. */}
          <g className="flow-motion" fill="var(--foreground)">
            {[0.2, 1.3, 2.4].map((begin) => (
              <rect key={begin} x="-7" y="-2" width="14" height="4" rx="1">
                <animateMotion dur="3.3s" begin={`${begin}s`} repeatCount="indefinite" path={THROUGH} />
              </rect>
            ))}
            {[0.6, 1.7, 2.8].map((begin) => (
              <rect key={begin} x="-7" y="-2" width="14" height="4" rx="1">
                <animateMotion dur="3.3s" begin={`${begin}s`} repeatCount="indefinite" path={OUT} />
              </rect>
            ))}
          </g>

          {/* The document. */}
          <g>
            <rect x="22" y="146" width="48" height="64" rx="4" fill="var(--card)" stroke="var(--foreground)" strokeWidth="1.5" />
            <path d="M32 164h28M32 174h28M32 184h20M32 194h24" stroke="var(--muted-foreground)" strokeWidth="1.5" />
            <text x="46" y="236" textAnchor="middle" className="fill-muted-foreground text-[13px]">
              contract.pdf
            </text>
          </g>

          <Node x={220} title="Router" note="one method per page" />
          {LANES.map((l) => (
            <text key={l.y} x="450" y={l.y - 12} textAnchor="middle" className="fill-muted-foreground font-mono text-[12px]">
              {l.label}
            </text>
          ))}
          <Node x={560} title="Veil" note="people's data covered" strong />
          <Node x={760} title="Gateway" note="only clean text passes" />

          {/* Whatever the team already uses: complydoc filters, it does not choose. */}
          <rect x="950" y="130" width="200" height="100" rx="10" fill="var(--card)" stroke="var(--foreground)" strokeWidth="1.5" strokeDasharray="5 5" />
          <foreignObject x="950" y="130" width="200" height="100">
            <span className="flex h-full flex-col items-center justify-center gap-3 text-[16px] font-medium text-foreground">
              Your model or tool
              <span className="flex items-center gap-3">
                {BRANDS.map((brand) => (
                  <BrandLogo key={brand} brand={brand} className="size-5" />
                ))}
              </span>
            </span>
          </foreignObject>
          <text x="1050" y="252" textAnchor="middle" className="fill-muted-foreground text-[12px]">
            the one you already use
          </text>
        </svg>
      </div>
      <figcaption className="text-sm text-muted-foreground">
        Dots: the page as written. Dashes: the page after Veil. Only the dashes leave your network.
      </figcaption>
    </figure>
  );
}

function Node({ x, title, note, strong = false }: { x: number; title: string; note: string; strong?: boolean }) {
  return (
    <g>
      <rect
        x={x}
        y="150"
        width="120"
        height="60"
        rx="10"
        fill={strong ? "var(--foreground)" : "var(--card)"}
        stroke="var(--foreground)"
        strokeWidth="1.5"
      />
      <foreignObject x={x} y="150" width="120" height="60">
        <span
          className={
            strong
              ? "flex h-full items-center justify-center gap-2 text-[18px] font-medium text-background"
              : "flex h-full items-center justify-center gap-2 text-[18px] font-medium text-foreground"
          }
        >
          <Logo withName={false} size={14} />
          {title}
        </span>
      </foreignObject>
      <text x={x + 60} y="232" textAnchor="middle" className="fill-muted-foreground text-[12px]">
        {note}
      </text>
    </g>
  );
}
