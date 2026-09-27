/**
 * A figure across runs, oldest to newest, as a line small enough to sit in a table cell:
 * the shape of a trend, with every value in words for a screen reader and on hover.
 */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const width = 48;
  const height = 16;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - 1 - ((value - low) / span) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const words = `${label} over the last ${values.length} runs: ${values.join(", ")}`;
  return (
    <svg
      role="img"
      aria-label={words}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle text-muted-foreground"
    >
      <title>{words}</title>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
