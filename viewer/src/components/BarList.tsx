import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface BarListProps<T> {
  /** What each bar stands for, and the colour it takes. One entry stacks nothing. */
  series: ChartConfig;
  data: T[];
  /** The field naming each bar. */
  category: keyof T & string;
  /** Shown instead of the value on a bar's tooltip, such as "$0.62". */
  format?: (value: number) => string;
  /** A colour for each bar of a single series, such as its provider's. */
  colour?: (row: T) => string;
}

const LABEL_WIDTH = 176;
/** Rows are this tall, so a chart of any length reads the same. */
const BAR_ROW = 26;

// Short enough for one line in the label column; the tooltip names the bar in full.
function shorten(text: string) {
  return text.length > 20 ? `${text.slice(0, 19)}…` : text;
}

/**
 * shadcn's horizontal bar chart, one bar per row of `data`, each row the
 * same height. With several series the bars stack, and a legend names them.
 */
export function BarList<T>({ series, data, category, format, colour }: BarListProps<T>) {
  const keys = Object.keys(series);
  const stacked = keys.length > 1;
  // Every bar gets the same row, so bars are one thickness in any chart; a legend adds a line.
  const height = data.length * BAR_ROW + (stacked ? 40 : 8);
  return (
    <ChartContainer config={series} className="w-full" style={{ height }} initialDimension={{ width: 480, height }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: stacked ? 12 : 56 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} />
        <YAxis
          dataKey={category as string}
          type="category"
          tickLine={false}
          axisLine={false}
          width={LABEL_WIDTH}
          tickFormatter={shorten}
          interval={0}
        />
        <XAxis type="number" hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              {...(format && {
                formatter: (value, name) => (
                  <span className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{series[String(name)]?.label ?? name}</span>
                    <span className="font-mono">{format(Number(value))}</span>
                  </span>
                ),
              })}
            />
          }
        />
        {/* In the series' own order, high before low, rather than alphabetical. */}
        {stacked && <ChartLegend itemSorter={null} content={<ChartLegendContent />} />}
        {keys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            {...(stacked && { stackId: "stack" })}
            fill={`var(--color-${key})`}
            maxBarSize={20}
            radius={index === keys.length - 1 ? [0, 4, 4, 0] : 0}
            isAnimationActive={false}
          >
            {!stacked && colour && data.map((row, index) => <Cell key={index} fill={colour(row)} />)}
            {/* A single series says its value at the end of each bar. */}
            {!stacked && (
              <LabelList
                dataKey={key}
                position="right"
                className="fill-muted-foreground text-xs"
                formatter={(value: unknown) => (format ? format(Number(value)) : String(value))}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}
