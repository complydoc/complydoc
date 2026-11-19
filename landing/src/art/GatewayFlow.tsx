import { BrandLogo } from "@/components/BrandLogo";
import { Logo } from "@/components/Logo";
import type { Brand } from "@/lib/logos";

/**
 * A document's way to the model, drawn as a track. The router sends each page down the cheapest
 * lane that loses nothing. The gateway is a filter: deterministic rules, Veil and Veil Judge read
 * the text side by side, and only what clears all three goes on to the model the team already
 * uses. complydoc does not pick the model. Pages travel as blue dots before the gateway and as
 * ink dashes after it.
 */

const LANES = [
  { y: 100, label: "text layer" },
  { y: 180, label: "local OCR" },
  { y: 260, label: "vision" },
];

/** The three checks inside the gateway, run in parallel. */
const CHECKS = [
  { y: 95, title: "Rules", note: "deterministic checks", strong: false },
  { y: 180, title: "Veil", note: "people's data", strong: true },
  { y: 265, title: "Veil Judge", note: "decides what to cover", strong: false },
];

/** Examples of the model a team may already use. The gateway works the same in front of any of them. */
const BRANDS: Brand[] = ["claude", "openai", "gemini", "mistral"];

const IN = "M70 180H150";
const lane = (y: number) => `M270 180C320 180 320 ${y} 370 ${y}C420 ${y} 420 180 470 180`;
const split = (y: number) => `M470 180C540 180 540 ${y} 590 ${y}`;
const join = (y: number) => `M750 ${y}C800 ${y} 800 180 870 180`;
const OUT = "M870 180H950";

export function GatewayFlow() {
  return (
    <figure className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <svg
          viewBox="0 0 1170 360"
          className="min-w-[720px]"
          role="img"
          aria-label="A document goes through the router, then the gateway runs rules, Veil and Veil Judge in parallel, and only the clean text goes to the model or tool you already use"
        >
          {/* The gateway: one filter around the three checks. */}
          <rect x="490" y="28" width="360" height="304" rx="16" fill="none" stroke="var(--border)" strokeWidth="1.5" />

          {/* The track. */}
          <g fill="none" stroke="var(--border)" strokeWidth="1.5">
            <path d={IN} />
            {LANES.map((l) => (
              <path key={l.y} d={lane(l.y)} />
            ))}
            {CHECKS.map((c) => (
              <path key={c.y} d={split(c.y)} />
            ))}
            {CHECKS.map((c) => (
              <path key={c.y} d={join(c.y)} />
            ))}
            <path d={OUT} />
          </g>

          {/* Before the gateway: blue dots, the page as written. */}
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
            {CHECKS.map((c) => (
              <circle key={c.y} r="4">
                <animateMotion dur="3.3s" begin="0.8s" repeatCount="indefinite" path={split(c.y)} />
              </circle>
            ))}
          </g>
          {/* After the gateway: ink dashes, only what cleared all three checks. */}
          <g className="flow-motion" fill="var(--foreground)">
            {CHECKS.map((c) => (
              <rect key={c.y} x="-7" y="-2" width="14" height="4" rx="1">
                <animateMotion dur="3.3s" begin="2s" repeatCount="indefinite" path={join(c.y)} />
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

          <Node x={150} y={180} title="Router" note="one method per page" />
          {LANES.map((l) => (
            <text key={l.y} x="370" y={l.y - 12} textAnchor="middle" className="fill-muted-foreground font-mono text-[12px]">
              {l.label}
            </text>
          ))}

          <foreignObject x="506" y="38" width="200" height="28">
            <span className="flex h-full items-center gap-2 text-[16px] font-medium text-foreground">
              <Logo withName={false} size={14} />
              Gateway
            </span>
          </foreignObject>
          {CHECKS.map((c) => (
            <Node key={c.y} x={590} y={c.y} width={160} height={44} title={c.title} note={c.note} strong={c.strong} />
          ))}
          <text x="834" y="57" textAnchor="end" className="fill-muted-foreground text-[12px]">
            all three at once
          </text>

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
        Dots: the page as written. Dashes: the text that cleared the rules, Veil and Veil Judge. Only the dashes leave
        your network.
      </figcaption>
    </figure>
  );
}

function Node({
  x,
  y,
  title,
  note,
  width = 120,
  height = 60,
  strong = false,
}: {
  x: number;
  y: number;
  title: string;
  note: string;
  width?: number;
  height?: number;
  strong?: boolean;
}) {
  const top = y - height / 2;
  return (
    <g>
      <rect
        x={x}
        y={top}
        width={width}
        height={height}
        rx="10"
        fill={strong ? "var(--foreground)" : "var(--card)"}
        stroke="var(--foreground)"
        strokeWidth="1.5"
      />
      <foreignObject x={x} y={top} width={width} height={height}>
        <span
          className={
            strong
              ? "flex h-full items-center justify-center gap-2 text-[16px] font-medium text-background"
              : "flex h-full items-center justify-center gap-2 text-[16px] font-medium text-foreground"
          }
        >
          {title}
        </span>
      </foreignObject>
      <text x={x + width / 2} y={top + height + 16} textAnchor="middle" className="fill-muted-foreground text-[12px]">
        {note}
      </text>
    </g>
  );
}
