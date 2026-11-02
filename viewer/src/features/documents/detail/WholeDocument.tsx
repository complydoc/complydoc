import { FileStackIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { providerColour, providerName } from "@/report/cost";
import { formatUsd } from "@/report/format";
import type { DocumentEntry, Report } from "@/report/types";
import { wholeDocument, windowShare } from "@/report/wholeDocument";

/**
 * The document sent whole to each model that reads PDFs: the tokens it comes to, how
 * much of the context window that is, and what one question about it costs. Opened on
 * a click; the text is what the page is for.
 */
export function WholeDocument({ report, document }: { report: Report; document: DocumentEntry }) {
  const rows = useMemo(() => wholeDocument(report, document), [report, document]);
  if (!rows.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <FileStackIcon />
          Whole
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(30rem,calc(100vw-2rem))]">
        <PopoverHeader>
          <PopoverTitle>Sent whole, as a PDF</PopoverTitle>
          <PopoverDescription>
            Each page as the provider reads a PDF: its text and an image of it, or 258 tokens a page on Gemini.
            Input for one question; the answer is extra.
          </PopoverDescription>
        </PopoverHeader>
        <table className="w-full text-sm" aria-label="Sent whole">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 font-normal">Model</th>
              <th className="py-1 pl-2 text-right font-normal whitespace-nowrap">Context</th>
              <th className="py-1 pl-2 text-right font-normal whitespace-nowrap">A question</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="w-full max-w-0 py-1.5">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: providerColour(row.provider) }}
                    />
                    <span className="min-w-0 truncate" title={`${providerName(row.provider)} · ${row.id}`}>
                      {row.name}
                    </span>
                  </span>
                </td>
                {row.tooLong ? (
                  <td colSpan={2} className="py-1.5 pl-2 text-right whitespace-nowrap text-destructive">
                    Too long: {row.tooLong}
                  </td>
                ) : (
                  <>
                    <td className="py-1.5 pl-2 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                      {windowShare(row) ?? "not counted"}
                    </td>
                    <td className="py-1.5 pl-2 text-right whitespace-nowrap tabular-nums">{formatUsd(row.usd)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </PopoverContent>
    </Popover>
  );
}
