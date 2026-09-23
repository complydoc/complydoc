import type { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StatProps {
  label: string;
  value: ReactNode;
  /** One short line under the figure. */
  note?: string;
}

/** One headline figure on a card. */
export function Stat({ label, value, note }: StatProps) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight">{value}</CardTitle>
        {note && <CardDescription className="text-xs">{note}</CardDescription>}
      </CardHeader>
    </Card>
  );
}

/** A row of stats, as many to a row as fit, whatever their number. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">{children}</div>;
}
