import { Label, Pie, PieChart } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
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

interface ReadinessChartProps {
  score: string;
  caption: string;
  bands: BandSlice[];
}

/** shadcn's donut chart: documents by readiness band, the folder's score in the middle. */
export function ReadinessChart({ score, caption, bands }: ReadinessChartProps) {
  const config = Object.fromEntries(
    // The legend reads "Ready 8": the count is in the label, so no tooltip is needed to find it.
    bands.map((band) => [band.id, { label: `${band.label} ${band.count}`, color: TONE_COLOUR[band.tone] }]),
  ) satisfies ChartConfig;
  const data = bands.map((band) => ({ band: band.id, count: band.count, fill: `var(--color-${band.id})` }));
  const summary = bands.map((band) => `${band.count} ${band.label.toLowerCase()}`).join(", ");

  return (
    <figure className="m-0 flex flex-col items-center">
      <ChartContainer config={config} className="aspect-square h-56" initialDimension={{ width: 224, height: 224 }}>
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="band" innerRadius={62} outerRadius={80} strokeWidth={2}>
            <Label
              content={({ viewBox }) =>
                viewBox && "cx" in viewBox ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-4xl font-semibold">
                      {score}
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 26} className="fill-muted-foreground text-xs">
                      {caption}
                    </tspan>
                  </text>
                ) : null
              }
            />
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="band" />} />
        </PieChart>
      </ChartContainer>
      <figcaption className="sr-only">
        Readiness {score}, {caption}: {summary}
      </figcaption>
    </figure>
  );
}
