import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/report/select";

const VARIANT = {
  good: "success",
  neutral: "secondary",
  warn: "warning",
  bad: "destructive",
} as const satisfies Record<Tone, string>;

/** A Badge coloured by what the report says about something: good, neutral, warn or bad. */
export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge variant={VARIANT[tone]}>{children}</Badge>;
}
