import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { fileName, formatCount, plural } from "@/report/format";
import { documentHref } from "@/report/route";
import type { Limitation, Report } from "@/report/types";

/** How many of what a limitation affects are named before the rest are counted. */
const NAMED = 4;

/** What a limitation applies to: documents link to themselves, anything else is named. */
function Affected({ report, affected }: { report: Report; affected: string[] }) {
  if (affected.length === 0) return null;
  const shown = affected.slice(0, NAMED);
  const rest = affected.length - shown.length;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      {shown.map((name) => {
        const index = report.documents.findIndex((document) => document.relative_path === name);
        return index >= 0 ? (
          <a key={name} href={documentHref(index)} className="underline-offset-4 hover:underline" title={name}>
            {fileName(name)}
          </a>
        ) : (
          <span key={name}>{name}</span>
        );
      })}
      {rest > 0 && <span title={affected.slice(NAMED).join(", ")}>and {formatCount(rest)} more</span>}
    </span>
  );
}

function LimitationItem({ report, limitation }: { report: Report; limitation: Limitation }) {
  const important = limitation.severity === "important";
  return (
    <Item role="listitem" size="sm" className="rounded-none">
      <ItemMedia>
        {important ? (
          <TriangleAlertIcon className="size-4 text-warning" aria-label="Important" />
        ) : (
          <InfoIcon className="size-4 text-muted-foreground" aria-label="Note" />
        )}
      </ItemMedia>
      <ItemContent className="gap-1">
        <ItemTitle>{limitation.area}</ItemTitle>
        <ItemDescription className="line-clamp-none">{limitation.statement}</ItemDescription>
        <Affected report={report} affected={limitation.affected} />
      </ItemContent>
    </Item>
  );
}

/** Limitations shown before the rest wait behind a button, so the findings stay in view. */
const FIRST = 3;

/** The limitations that change what a figure in this report means. */
export function ImportantLimitations({ report, limitations }: { report: Report; limitations: Limitation[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? limitations : limitations.slice(0, FIRST);
  const hidden = limitations.length - shown.length;
  return (
    <Card className="gap-0 py-0">
      <ItemGroup aria-label="Important limitations" className="divide-y">
        {shown.map((limitation, index) => (
          <LimitationItem key={`${limitation.area}-${index}`} report={report} limitation={limitation} />
        ))}
      </ItemGroup>
      {(hidden > 0 || all) && limitations.length > FIRST && (
        <Button variant="ghost" size="sm" className="m-1 self-start" onClick={() => setAll((value) => !value)}>
          {all ? "Show fewer" : `Show ${formatCount(hidden)} more`}
        </Button>
      )}
    </Card>
  );
}

/** How the rest of the figures were got, folded away until asked for. */
export function LimitationNotes({ report, limitations }: { report: Report; limitations: Limitation[] }) {
  return (
    <details className="group rounded-lg border">
      <summary className="cursor-pointer px-4 py-3 text-sm text-muted-foreground select-none hover:text-foreground">
        {plural(limitations.length, "note")} on how the figures were got
      </summary>
      <ItemGroup aria-label="Notes on this run" className="px-2 pb-2">
        {limitations.map((limitation, index) => (
          <LimitationItem key={`${limitation.area}-${index}`} report={report} limitation={limitation} />
        ))}
      </ItemGroup>
    </details>
  );
}
