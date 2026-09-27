import type { ReactNode } from "react";
import { ToneBadge } from "@/components/ToneBadge";
import { fileName, formatCount, formatPageUsd, formatSeconds, plural } from "@/report/format";
import type { DocumentEntry } from "@/report/types";

interface DocumentHeaderProps {
  document: DocumentEntry;
  /** Who read the text shown, when one reader did. */
  reader: string | null;
  /** What reading the document costs and takes under the plan chosen, when priced. */
  usd: number | null;
  seconds: number | null;
  /** Whether identifiers were looked for, so no badge reads as none found. */
  scanned: boolean;
  /** Findings still open, after the ignored are set aside. */
  identifiers: number;
  high: number;
  hidden: number;
  controls: ReactNode;
}

/**
 * The document's name, where it sits in the folder, and what it is in one line: its
 * type, pages, reader and cost, and what was found in it.
 */
export function DocumentHeader({
  document,
  reader,
  usd,
  seconds,
  scanned,
  identifiers,
  high,
  hidden,
  controls,
}: DocumentHeaderProps) {
  const name = fileName(document.relative_path);
  const folder = document.relative_path.slice(0, -name.length).replace(/[\\/]$/, "");
  const facts = [
    document.format.toUpperCase(),
    plural(document.page_count || document.extracted_text.length, "page"),
    reader && `read by ${reader}`,
    usd !== null && [formatPageUsd(usd), seconds !== null ? formatSeconds(seconds) : null].filter(Boolean).join(" · "),
  ].filter(Boolean);

  return (
    <header className="flex shrink-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="min-w-0 truncate font-heading text-xl font-semibold tracking-tight" title={document.relative_path}>
          {folder && <span className="font-normal text-muted-foreground">{folder}/</span>}
          {name}
        </h2>
        <span className="ml-auto flex items-center gap-2">{controls}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
        <span className="tabular-nums">{facts.join(" · ")}</span>
        {scanned && (
          <span className="flex flex-wrap items-center gap-1.5">
            {identifiers === 0 && hidden === 0 ? (
              <ToneBadge tone="good">Nothing found</ToneBadge>
            ) : (
              <>
                {identifiers > 0 && (
                  <ToneBadge tone={high > 0 ? "bad" : "warn"}>
                    {plural(identifiers, "identifier")}
                    {high > 0 && ` · ${formatCount(high)} high`}
                  </ToneBadge>
                )}
                {hidden > 0 && <ToneBadge tone="bad">{plural(hidden, "hidden passage")}</ToneBadge>}
              </>
            )}
          </span>
        )}
      </div>
    </header>
  );
}
