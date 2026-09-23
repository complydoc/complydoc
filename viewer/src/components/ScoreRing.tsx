import { cn } from "@/lib/utils";
import type { Tone } from "@/report/select";

export interface RingSegment {
  label: string;
  count: number;
  tone: Tone;
}

interface ScoreRingProps {
  score: string;
  caption: string;
  segments: RingSegment[];
  size?: number;
}

const STROKE = 12;

const TONE_STROKE: Record<Tone, string> = {
  good: "stroke-success",
  neutral: "stroke-chart-2",
  warn: "stroke-warning",
  bad: "stroke-destructive",
};

/** A score in the middle of a ring split by how many documents fall in each band. */
export function ScoreRing({ score, caption, segments, size = 160 }: ScoreRingProps) {
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.count, 0) || 1;
  const summary = segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ");

  const lengths = segments.map((segment) => (segment.count / total) * circumference);
  const arcs = segments.map((segment, index) => ({
    ...segment,
    length: lengths[index] ?? 0,
    // Each arc starts where the ones before it end.
    offset: lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  }));

  return (
    <figure className="relative m-0 shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" aria-hidden="true">
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            className={cn(TONE_STROKE[arc.tone])}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={STROKE}
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </svg>
      <figcaption className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tracking-tighter">{score}</span>
        <span className="text-xs text-muted-foreground">{caption}</span>
        <span className="sr-only">{summary}</span>
      </figcaption>
    </figure>
  );
}
