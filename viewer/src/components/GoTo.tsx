import { Command as CommandPrimitive } from "cmdk";
import { FileTextIcon, HistoryIcon, KeyboardIcon, PanelLeftIcon, SearchIcon, XIcon } from "lucide-react";
import { useContext, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { GO_KEY, PAGE_INFO, PAGES } from "@/app/pages";
import { FootKey, Row, Section, TypeTab } from "@/components/goto/parts";
import { Keys } from "@/components/Keys";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { shortcut } from "@/lib/shortcut";
import { runKind, runLabel } from "@/report/collections";
import { fileName } from "@/report/format";
import { recentsFor, remember, type Recent } from "@/report/recents";
import type { Report } from "@/report/types";

type Kind = "all" | "pages" | "documents" | "runs" | "actions";

const MOD = shortcut("").trim();

/**
 * Search the report from the keyboard: a page, a document by any part of its path, another
 * run of the folder, or something to do. It opens on where the reader has just been, shows
 * one kind of thing at a time from the tabs under the search, and says at its foot which
 * keys work. ⌘K or Ctrl+K opens it from any page.
 */
export function GoTo({ report, onShortcuts }: { report: Report; onShortcuts?: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const { runs, current, open: openRun } = useContext(FolderRunsContext);
  const { state, toggleSidebar } = useSidebar();
  const others = runs.filter((run) => run.id !== current);

  useEffect(() => {
    const onKey = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const kinds: { id: Kind; label: string }[] = [
    { id: "all", label: "All" },
    { id: "pages", label: "Pages" },
    ...(report.documents.length > 0 ? [{ id: "documents" as const, label: "Documents" }] : []),
    ...(others.length > 0 ? [{ id: "runs" as const, label: "Runs" }] : []),
    { id: "actions", label: "Actions" },
  ];
  const shows = (which: Kind) => kind === "all" || kind === which;
  // Where the reader has just been, while nothing is typed: read when the menu opens.
  const recents = useMemo<Recent[]>(() => (open ? recentsFor(current ?? "") : []), [open, current]);

  const change = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setKind("all");
    }
  };
  const go = (hash: string, label: string, what: Recent["kind"]) => {
    remember({ run: current ?? "", hash, label, kind: what });
    change(false);
    window.location.assign(`#${hash}`);
  };
  const act = (action: () => void) => {
    change(false);
    action();
  };
  // With nothing typed the arrows change the kind shown; with text, they move in it.
  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (query || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const at = kinds.findIndex((k) => k.id === kind);
    const next = kinds[(at + (event.key === "ArrowRight" ? 1 : -1) + kinds.length) % kinds.length];
    if (next) setKind(next.id);
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Search" onClick={() => setOpen(true)} className="text-muted-foreground">
            <SearchIcon />
            <span>Go to…</span>
            <kbd className="ml-auto font-mono text-xs">{shortcut("K")}</kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <Dialog open={open} onOpenChange={change}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>A page, a document, a run or something to do</DialogDescription>
        </DialogHeader>
        <DialogContent
          showCloseButton={false}
          className="top-[14vh] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-2xl"
        >
          <CommandPrimitive loop label="Search pages, documents and runs" className="flex flex-col">
            <div className="flex items-center gap-3 px-5 pt-4">
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                onKeyDown={onInputKey}
                placeholder="Search"
                className="h-10 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => change(false)}
                aria-label="Close"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <div role="tablist" aria-label="Kind" className="flex flex-wrap gap-1 border-b px-4 pt-1 pb-3">
              {kinds.map((k) => (
                <TypeTab key={k.id} active={kind === k.id} onPick={() => setKind(k.id)}>
                  {k.label}
                </TypeTab>
              ))}
            </div>
            <CommandPrimitive.List className="max-h-[min(56vh,30rem)] overflow-y-auto overscroll-contain px-2 pb-1">
              <CommandPrimitive.Empty className="py-10 text-center text-sm text-muted-foreground">
                Nothing by that name.
              </CommandPrimitive.Empty>
              {kind === "all" && !query && recents.length > 0 && (
                <Section heading="Recents">
                  {recents.map((recent) => {
                    const Icon = recent.kind === "document" ? FileTextIcon : SearchIcon;
                    return (
                      <Row
                        key={recent.hash}
                        value={`recent ${recent.label}`}
                        onSelect={() => go(recent.hash, recent.label, recent.kind)}
                        icon={<Icon />}
                      >
                        {recent.label}
                      </Row>
                    );
                  })}
                </Section>
              )}
              {shows("pages") && (
                <Section heading="Pages">
                  {PAGES.map((page) => {
                    const { label, icon: Icon } = PAGE_INFO[page];
                    return (
                      <Row
                        key={page}
                        value={`page ${label}`}
                        onSelect={() => go(page, label, "page")}
                        icon={<Icon />}
                        aside={<Keys keys={["G", GO_KEY[page]]} />}
                      >
                        {label}
                      </Row>
                    );
                  })}
                </Section>
              )}
              {shows("documents") && report.documents.length > 0 && (
                <Section heading="Documents">
                  {report.documents.map((document, index) => {
                    const name = fileName(document.relative_path);
                    return (
                      <Row
                        key={document.relative_path}
                        value={`document ${document.relative_path}`}
                        onSelect={() => go(`documents/${index}`, name, "document")}
                        icon={<FileTextIcon />}
                        aside={
                          document.relative_path !== name && (
                            <span className="max-w-56 truncate">{document.relative_path}</span>
                          )
                        }
                      >
                        {name}
                      </Row>
                    );
                  })}
                </Section>
              )}
              {shows("runs") && others.length > 0 && (
                <Section heading="Runs of this folder">
                  {others.map((run) => (
                    <Row
                      key={run.id}
                      value={`run ${runKind(run.report)} ${runLabel(run.report)}`}
                      onSelect={() => act(() => openRun(run.id))}
                      icon={<HistoryIcon />}
                      aside={runLabel(run.report)}
                    >
                      {runKind(run.report)}
                    </Row>
                  ))}
                </Section>
              )}
              {shows("actions") && (
                <Section heading="Actions">
                  <Row
                    value="sidebar collapse expand toggle"
                    onSelect={() => act(toggleSidebar)}
                    icon={<PanelLeftIcon />}
                    aside={<Keys keys={[MOD, "B"]} />}
                  >
                    {state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
                  </Row>
                  {onShortcuts && (
                    <Row
                      value="keyboard shortcuts keys help"
                      onSelect={() => act(onShortcuts)}
                      icon={<KeyboardIcon />}
                      aside={<Keys keys={["?"]} />}
                    >
                      Keyboard shortcuts
                    </Row>
                  )}
                </Section>
              )}
            </CommandPrimitive.List>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-5 py-2.5 text-xs text-muted-foreground">
              <FootKey label="Close" keys={["Esc"]} />
              <FootKey label="Change type" keys={["←", "→"]} />
              <FootKey label="Move" keys={["↑", "↓"]} />
              <FootKey label="Open" keys={["↵"]} />
            </div>
          </CommandPrimitive>
        </DialogContent>
      </Dialog>
    </>
  );
}
