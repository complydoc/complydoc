import { cn } from "cn";
import { Label, Pie, PieChart } from "recharts";
import { ToneBadge } from "@/components/ToneBadge";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { Tone } from "@/report/select";

export interface BandSlice {
  /** A key without spaces, used for the slice's colour variable. */
  id: string;
  label: string;
  count: number;
  tone: Tone;
}

const TONE_COLOUR: Record<Tone, string> = {
  good: "var(--primary)",
  neutral: "var(--chart-2)",
  warn: "var(--warning)",
  bad: "var(--destructive)",
};

const SIZE = 192;

interface ReadinessChartProps {
  score: string;
  /** The score as a number from 0 to 100, which the ring fills to; null when not scored. */
  value: number | null;
  /** A smaller ring, for beside other content rather than above it. */
  small?: boolean;
  /** The tone of the band the score falls in, which colours the ring. */
  tone: Tone;
  caption: string;
  bands: BandSlice[];
}

/**
 * A ring filled as far as the folder's score, clockwise from twelve o'clock,
 * the score in the middle, and the documents in each band as badges beneath.
 * The ring is the score, not the mix of bands: a ring a third full around a
 * score of 74 read as a third of something.
 */
export function ReadinessChart({ score, value, tone, caption, bands, small = false }: ReadinessChartProps) {
  const config = {
    score: { label: "Score", color: TONE_COLOUR[tone] },
    rest: { label: "To 100", color: "var(--muted)" },
  } satisfies ChartConfig;
  const filled = Math.max(0, Math.min(100, value ?? 0));
  const data = [
    { part: "score", count: filled, fill: "var(--color-score)" },
    { part: "rest", count: 100 - filled, fill: "var(--color-rest)" },
  ];
  const summary = bands.map((band) => `${band.count} ${band.label.toLowerCase()}`).join(", ");

  return (
    <figure className={cn("m-0 flex flex-col items-center", small ? "gap-2.5" : "gap-4")}>
      <ChartContainer config={config} className={cn("aspect-square", small ? "size-28" : "size-40")} initialDimension={{ width: SIZE, height: SIZE }}>
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            dataKey="count"
            nameKey="part"
            cx="50%"
            cy="50%"
            innerRadius="78%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
            isAnimationActive={false}
          >
            <Label
              content={({ viewBox }) =>
                viewBox && "cx" in viewBox && viewBox.cx !== undefined && viewBox.cy !== undefined ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy + (small ? 2 : 4)}
                      className={cn("fill-foreground font-semibold", small ? "text-2xl" : "text-4xl")}
                    >
                      {score}
                    </tspan>
                    <tspan x={viewBox.cx} y={viewBox.cy + (small ? 18 : 24)} className="fill-muted-foreground text-xs">
                      {caption}
                    </tspan>
                  </text>
                ) : null
              }
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <figcaption className="flex flex-wrap justify-center gap-2">
        <span className="sr-only">
          Readiness {score}, {caption}: {summary}
        </span>
        {bands.map((band) => (
          <ToneBadge key={band.id} tone={band.tone}>
            {band.label} {band.count}
          </ToneBadge>
        ))}
      </figcaption>
    </figure>
  );
}
