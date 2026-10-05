import { FileTextIcon, HistoryIcon, PanelLeftIcon, SearchIcon } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { GO_KEY, PAGE_INFO, PAGES } from "@/app/pages";
import { Keys } from "@/components/Keys";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { shortcut } from "@/lib/shortcut";
import { runKind, runLabel } from "@/report/collections";
import { fileName } from "@/report/format";
import type { Report } from "@/report/types";

/**
 * Jump anywhere in the report from the keyboard: a page, a document by any part of its
 * path, or another run of the folder; or fold the sidebar away. ⌘K or Ctrl+K opens it
 * from any page.
 */
export function GoTo({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  const { runs, current, open: openRun } = useContext(FolderRunsContext);
  const { state, toggleSidebar } = useSidebar();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (hash: string) => {
    setOpen(false);
    window.location.assign(`#${hash}`);
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Go to…" onClick={() => setOpen(true)} className="text-muted-foreground">
            <SearchIcon />
            <span>Go to…</span>
            <kbd className="ml-auto font-mono text-xs">{shortcut("K")}</kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <CommandDialog open={open} onOpenChange={setOpen} title="Go to" description="A page, a document or a run">
        <Command>
          <CommandInput placeholder="A page, a document or a run…" />
          <CommandList>
            <CommandEmpty>Nothing by that name.</CommandEmpty>
            <CommandGroup heading="Pages">
              {PAGES.map((page) => {
                const { label, icon: Icon } = PAGE_INFO[page];
                return (
                  <CommandItem key={page} value={`page ${label}`} onSelect={() => go(page)}>
                    <Icon />
                    {label}
                    <CommandShortcut className="tracking-normal">
                      <Keys keys={["G", GO_KEY[page]]} />
                    </CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {report.documents.length > 0 && (
              <CommandGroup heading="Documents">
                {report.documents.map((document, index) => (
                  <CommandItem
                    key={document.relative_path}
                    value={`document ${document.relative_path}`}
                    onSelect={() => go(`documents/${index}`)}
                  >
                    <FileTextIcon />
                    <span className="truncate">{fileName(document.relative_path)}</span>
                    {document.relative_path !== fileName(document.relative_path) && (
                      <CommandShortcut className="truncate tracking-normal">{document.relative_path}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {runs.length > 1 && (
              <CommandGroup heading="Runs of this folder">
                {runs
                  .filter((run) => run.id !== current)
                  .map((run) => (
                    <CommandItem
                      key={run.id}
                      value={`run ${runKind(run.report)} ${runLabel(run.report)}`}
                      onSelect={() => {
                        setOpen(false);
                        openRun(run.id);
                      }}
                    >
                      <HistoryIcon />
                      {runKind(run.report)}
                      <CommandShortcut className="tracking-normal">{runLabel(run.report)}</CommandShortcut>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
            <CommandGroup heading="View">
              <CommandItem
                value="sidebar collapse expand toggle"
                onSelect={() => {
                  setOpen(false);
                  toggleSidebar();
                }}
              >
                <PanelLeftIcon />
                {state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
                <CommandShortcut>{shortcut("B")}</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
