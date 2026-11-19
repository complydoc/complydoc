import { BrandLogo } from "@/components/BrandLogo";
import { Logo } from "@/components/Logo";
import type { Brand } from "@/lib/logos";

/**
 * A document's way to the models, drawn as a track: the router sends each page down the
 * cheapest lane that loses nothing, Veil covers people's data, and the gateway decides which
 * model may read what. Pages travel as blue dots until Veil, and as ink dashes after it.
 */

const LANES = [
  { y: 80, label: "text layer" },
  { y: 180, label: "local OCR" },
  { y: 280, label: "vision" },
];

const MODELS: { y: number; label: string; brand: Brand }[] = [
  { y: 60, label: "Claude", brand: "claude" },
  { y: 140, label: "OpenAI", brand: "openai" },
  { y: 220, label: "Gemini", brand: "gemini" },
  { y: 300, label: "Mistral, on your servers", brand: "mistral" },
];

const IN = "M70 180H220";
const lane = (y: number) => `M340 180C400 180 400 ${y} 450 ${y}C500 ${y} 500 180 560 180`;
const THROUGH = "M680 180H760";
const out = (y: number) => `M880 180C930 180 930 ${y} 980 ${y}`;

export function GatewayFlow() {
  return (
    <figure className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <svg viewBox="0 0 1180 360" className="min-w-[720px]" role="img" aria-label="A document goes through the router, Veil and the gateway, then to the models">
          {/* The track. */}
          <g fill="none" stroke="var(--border)" strokeWidth="1.5">
            <path d={IN} />
            {LANES.map((l) => (
              <path key={l.y} d={lane(l.y)} />
            ))}
            <path d={THROUGH} />
            {MODELS.map((m) => (
              <path key={m.y} d={out(m.y)} />
            ))}
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
            {MODELS.map((m, i) => (
              <rect key={m.y} x="-7" y="-2" width="14" height="4" rx="1">
                <animateMotion dur="3.3s" begin={`${i * 0.8 + 0.6}s`} repeatCount="indefinite" path={out(m.y)} />
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
          <Node x={760} title="Gateway" note="which model gets what" />
          {MODELS.map((m) => (
            <foreignObject key={m.y} x="984" y={m.y - 14} width="196" height="28">
              <span className="flex h-full items-center gap-2 text-[15px] text-foreground">
                <BrandLogo brand={m.brand} className="size-5" />
                {m.label}
              </span>
            </foreignObject>
          ))}
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
