import { useContext, useMemo, useRef, useState } from "react";
import { DocumentDiff } from "@/features/documents/diff/DocumentDiff";
import { useHashParam } from "@/hooks/useHashRoute";
import { useIsIgnored } from "@/hooks/useIgnores";
import type { InlineFindings, InlineMark } from "@/hooks/useInlineMarks";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { usePlan } from "@/hooks/usePlan";
import { chunkLayers } from "@/report/chunkPlaces";
import { KEPT, canReveal, pageText, readersOf } from "@/report/documentDiff";
import { fileName, formatPageUsd, formatSeconds } from "@/report/format";
import { measured } from "@/report/measured";
import { findingHighlight } from "@/report/highlight";
import { documentFindings, findingContext, findingFor } from "@/report/pageFindings";
import { hasPicture } from "@/report/picture";
import { documentTotals, pageEstimate } from "@/report/plan";
import type { FindingRef } from "@/report/route";
import type { DocumentEntry, Report } from "@/report/types";
import { ChunkPicker, EyeToggle, ModeToggle } from "./DocumentControls";
import { DocumentHeader } from "./DocumentHeader";
import { DocumentText } from "./DocumentText";
import { FindingsPanel, type PanelView } from "./FindingsPanel";
import { PageNav } from "./PageNav";
import { FindingPopover } from "./FindingPopover";
import { PagePane } from "./PagePane";
import { VisionNote } from "./VisionNote";

interface DocumentDetailProps {
  report: Report;
  document: DocumentEntry;
  /** Position of the document in the report, for links back to it. */
  index: number;
  /** The page to open on, as printed; the first when null. */
  page?: number | null;
  /** A finding to open on, marked out from the rest. */
  finding?: FindingRef | null;
}

/**
 * One document. Read more than one way, a diff of two readings; read one way, every
 * page of it one after the other, lines numbered. What was found is marked in the text
 * itself, listed beside it page by page, and dotted on the pages down the side: rest on
 * a mark for what it is and to ignore it, or pick one from the list to go to it.
 */
export function DocumentDetail({
  report,
  document,
  index,
  page: startPage = null,
  finding = null,
}: DocumentDetailProps) {
  const highlight = finding ? findingHighlight(document, finding) : null;
  const opening = highlight?.page ?? startPage;
  const pages = document.extracted_text;
  const pageAt = (number: number) =>
    Math.max(
      0,
      pages.findIndex((p) => p.number === number),
    );
  const [pageIndex, setPageIndex] = useState(() => (opening === null ? 0 : pageAt(opening)));
  const [view, setView] = useState<PanelView>("findings");
  // A page the diff should scroll to. A new object each time, so asking again still scrolls.
  const [jump, setJump] = useState<{ page: number } | null>(() =>
    opening !== null && !finding ? { page: opening } : null,
  );
  const revealable = canReveal(document);
  const [eye, setEye] = useState(false);
  const unmasked = eye && revealable;
  const isIgnored = useIsIgnored();
  const { plan, models } = usePlan();
  // This run's chunks of the document, as a pipeline's run holds; or else the folder's, when
  // a chunks run made some. None drawn until asked.
  const { runs } = useContext(FolderRunsContext);
  const layers = useMemo(
    () => chunkLayers(report.chunks?.length ? [{ id: "on-screen", name: "", report }] : runs, document),
    [report, runs, document],
  );
  // In the address, so a link from the Chunks page opens the document with its cuts drawn.
  const [chunkBy, setChunkBy] = useHashParam("chunks");
  const layer = layers.find((l) => l.splitter === chunkBy) ?? null;
  // A document read more than one way opens on the diff, unless a finding or a splitter's
  // cuts were asked for: those are shown in the text, and the diff shows neither.
  const [mode, setMode] = useState<"text" | "diff">(() => (finding || chunkBy ? "text" : "diff"));

  const findings = useMemo(() => documentFindings(document, unmasked), [document, unmasked]);
  const linked = finding ? findingFor(findings, document, finding) : undefined;
  const [active, setActive] = useState<string | null>(() => linked?.key ?? null);
  const [focus, setFocus] = useState<{ key: string } | null>(() => (linked ? { key: linked.key } : null));
  const [picked, setPicked] = useState<{ key: string; rect: DOMRect } | null>(null);
  // Leaving a mark closes its card after a moment, so the pointer can cross into the card to tick it.
  const closing = useRef(0);
  const cancelClose = () => window.clearTimeout(closing.current);
  const scheduleClose = () => {
    cancelClose();
    closing.current = window.setTimeout(() => setPicked(null), 300);
  };

  const page = pages[pageIndex];
  if (!page) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{fileName(document.relative_path)}</h2>
        <p className="text-muted-foreground">
          This report carries no text for the document. Run the audit with <code>--extracted-text</code>.
        </p>
      </div>
    );
  }

  // Chunks are placed in the kept text, so drawing them shows that text alone, not the diff.
  const readers = readersOf(report, document);
  const compared = readers.length > 1 && mode === "diff" && layer === null;
  // The diff shows the two readings and nothing else: findings are marked and listed only
  // in a single reading. Ignored ones stay in the text, struck through, to be brought back.
  const shown = compared ? [] : findings;
  const marks: InlineMark[] = shown.map((f) => ({
    key: f.key,
    needle: f.needle,
    tone: isIgnored(f) ? "ignored" : f.severity,
  }));
  const contextOf = (f: (typeof findings)[number]) => {
    const on = pages.find((p) => p.number === f.page);
    return on ? findingContext(pageText(on, KEPT, unmasked), f.needle) : null;
  };
  const preview = document.previews?.find((p) => p.number === page.number);
  const pictures = (document.previews ?? []).some(hasPicture);
  const verified = document.verification !== null && document.verification !== undefined;
  const checked = document.verification?.pages.find((p) => p.number === page.number);
  const priced = models.length > 0 && pages.some((p) => p.tokens !== undefined);
  const scanned = measured(report, "sensitive");
  const open = findings.filter((f) => !isIgnored(f));

  // What each page costs and takes to read under the plan, beside its number.
  const notes: Record<number, string> = {};
  if (priced)
    for (const each of pages) {
      const estimate = pageEstimate(report, document, each, plan);
      if (!estimate.read) continue;
      notes[each.number] = [
        formatPageUsd(estimate.usd),
        ...(estimate.seconds !== null ? [formatSeconds(estimate.seconds)] : []),
      ].join(" · ");
    }
  const totals = priced ? documentTotals(report, document, plan) : null;

  const goTo = (number: number) => {
    setPageIndex(pageAt(number));
    setJump({ page: number });
  };
  const onPick = (key: string, rect: DOMRect) => {
    cancelClose();
    setActive(key);
    setPicked({ key, rect });
  };
  const inline: InlineFindings = {
    marks,
    active,
    focus,
    onPick,
    // Resting on a mark opens its card, like a click, without making it the one in hand.
    onHover: (key, rect) => {
      cancelClose();
      setPicked({ key, rect });
    },
    onLeave: scheduleClose,
    onRail: (key) => {
      setActive(key);
      setFocus({ key });
      setPicked(null);
    },
    label: (key) => {
      const found = findings.find((f) => f.key === key);
      return found ? `${found.label}, ${found.severity}${found.page !== null ? `, page ${found.page}` : ""}` : key;
    },
  };

  const eyeToggle = <EyeToggle available={revealable} on={unmasked} onChange={setEye} />;
  const pagePanel =
    pictures || verified ? (
      <>
        {pictures && (
          <div className="min-h-0 flex-1">
            {hasPicture(preview) ? (
              <PagePane
                number={page.number}
                name={fileName(document.relative_path)}
                preview={preview}
                mark={highlight && highlight.page === page.number ? highlight.box : null}
                ignored={findings
                  .filter((f) => f.match && isIgnored(f))
                  .map((f) => ({ value: f.match?.masked ?? "", label: f.label, revealed: f.match?.revealed ?? null }))}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                No picture of page {page.number}
              </div>
            )}
          </div>
        )}
        {verified &&
          (checked ? (
            <VisionNote page={checked} model={document.verification?.model ?? ""} />
          ) : (
            <p className="px-1 text-sm text-muted-foreground">The vision check did not read page {page.number}.</p>
          ))}
      </>
    ) : undefined;

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100svh-6rem)]">
      <DocumentHeader
        document={document}
        reader={compared ? null : (readers[0]?.label.replace(/ \(kept\)$/, "") ?? null)}
        usd={totals?.usd ?? null}
        seconds={totals && totals.untimed === 0 ? totals.seconds : null}
        scanned={scanned}
        identifiers={open.filter((f) => f.kind === "identifier").reduce((sum, f) => sum + f.count, 0)}
        high={open.filter((f) => f.kind === "identifier" && f.severity === "high").reduce((sum, f) => sum + f.count, 0)}
        hidden={open.filter((f) => f.kind === "hidden").length}
        controls={
          <>
            {readers.length > 1 && (
              <ModeToggle
                value={compared ? "diff" : "text"}
                onChange={(next) => {
                  setMode(next);
                  if (next === "diff") setChunkBy(null);
                }}
              />
            )}
            {layers.length > 0 && <ChunkPicker layers={layers} value={chunkBy} onChange={setChunkBy} />}
            {!compared && eyeToggle}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <PageNav pages={pages.map((p) => p.number)} current={page.number} findings={open} onPick={goTo} />
        <div className="flex h-[80svh] min-h-0 min-w-0 flex-col lg:h-auto lg:flex-1">
          {compared ? (
            <DocumentDiff
              report={report}
              index={index}
              jump={jump}
              unmasked={unmasked}
              notes={notes}
              inline={inline}
              controls={eyeToggle}
              onVisiblePage={(number) => setPageIndex(pageAt(number))}
            />
          ) : (
            <DocumentText
              pages={pages.map((p) => ({
                number: p.number,
                text: pageText(p, KEPT, unmasked),
                ...(notes[p.number] && { note: notes[p.number] }),
              }))}
              inline={inline}
              chunks={layer ? layer.pages : null}
              jump={jump}
              onVisiblePage={(number) => setPageIndex(pageAt(number))}
            />
          )}
        </div>
        {(shown.length > 0 || pagePanel) && (
          <FindingsPanel
            findings={shown}
            active={active}
            isIgnored={isIgnored}
            onPick={(key) => {
              if (key) inline.onRail(key);
              else setActive(null);
            }}
            contextOf={contextOf}
            current={page.number}
            page={pagePanel}
            view={view}
            onView={setView}
          />
        )}
      </div>

      <FindingPopover
        finding={findings.find((f) => f.key === picked?.key) ?? null}
        rect={picked?.rect ?? null}
        onClose={() => setPicked(null)}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
      />
    </div>
  );
}
