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
  good: "var(--success)",
  neutral: "var(--chart-2)",
  warn: "var(--warning)",
  bad: "var(--destructive)",
};

const SIZE = 192;

interface ReadinessChartProps {
  score: string;
  /** The score as a number from 0 to 100, which the ring fills to; null when not scored. */
  value: number | null;
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
export function ReadinessChart({ score, value, tone, caption, bands }: ReadinessChartProps) {
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
    <figure className="m-0 flex flex-col items-center gap-4">
      <ChartContainer config={config} className="aspect-square size-48" initialDimension={{ width: SIZE, height: SIZE }}>
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
                    <tspan x={viewBox.cx} y={viewBox.cy + 4} className="fill-foreground text-4xl font-semibold">
                      {score}
                    </tspan>
                    <tspan x={viewBox.cx} y={viewBox.cy + 24} className="fill-muted-foreground text-xs">
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
