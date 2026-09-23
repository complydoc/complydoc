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
  caption: string;
  bands: BandSlice[];
}

/**
 * shadcn's donut chart: documents by readiness band, clockwise from twelve
 * o'clock, the folder's score in the middle and the bands as badges beneath.
 */
export function ReadinessChart({ score, caption, bands }: ReadinessChartProps) {
  const config = Object.fromEntries(
    bands.map((band) => [band.id, { label: band.label, color: TONE_COLOUR[band.tone] }]),
  ) satisfies ChartConfig;
  const data = bands.map((band) => ({ band: band.id, count: band.count, fill: `var(--color-${band.id})` }));
  const summary = bands.map((band) => `${band.count} ${band.label.toLowerCase()}`).join(", ");

  return (
    <figure className="m-0 flex flex-col items-center gap-4">
      <ChartContainer config={config} className="aspect-square size-48" initialDimension={{ width: SIZE, height: SIZE }}>
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            dataKey="count"
            nameKey="band"
            cx="50%"
            cy="50%"
            innerRadius="78%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            strokeWidth={2}
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
