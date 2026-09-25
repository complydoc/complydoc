import { CheckIcon, ChevronsUpDownIcon, FolderIcon, FolderPlusIcon, HistoryIcon, LayoutGridIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { runLabel, type Collection } from "@/report/collections";
import { plural } from "@/report/format";

export interface Selection {
  /** The folder on screen, or null for the overview of every folder. */
  collection: string | null;
  /** The run of that folder on screen. */
  run: string | null;
}

interface CollectionSwitcherProps {
  collections: Collection[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onAdd: (files: File[]) => void;
  onCloseAll: () => void;
}

/** Which folder is on screen, which run of it, and the way to open more. */
export function CollectionSwitcher({ collections, selection, onSelect, onAdd, onCloseAll }: CollectionSwitcherProps) {
  const input = useRef<HTMLInputElement>(null);
  const current = collections.find((c) => c.id === selection.collection) ?? null;
  const run = current?.runs.find((r) => r.id === selection.run) ?? current?.runs[0];
  const documents = collections.reduce((sum, c) => sum + (c.runs[0]?.report.documents.length ?? 0), 0);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={current?.name ?? "All collections"} aria-label="Switch collection">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent">
                {current ? <FolderIcon className="size-4" /> : <LayoutGridIcon className="size-4" />}
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-medium">{current?.name ?? "All collections"}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {current && run
                    ? `${plural(run.report.documents.length, "document")} · ${runLabel(run.report)}`
                    : `${plural(collections.length, "folder")} · ${plural(documents, "document")}`}
                </span>
              </span>
              <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {collections.length > 1 && (
              <DropdownMenuItem onSelect={() => onSelect({ collection: null, run: null })}>
                <LayoutGridIcon />
                All collections
                {!current && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
            )}
            <DropdownMenuLabel className="text-xs text-muted-foreground">Folders</DropdownMenuLabel>
            <DropdownMenuGroup>
              {collections.map((collection) => (
                <DropdownMenuItem
                  key={collection.id}
                  onSelect={() => onSelect({ collection: collection.id, run: collection.runs[0]?.id ?? null })}
                  title={collection.id}
                >
                  <FolderIcon />
                  <span className="truncate">{collection.name}</span>
                  {collection.runs.length > 1 && (
                    <span className="text-xs text-muted-foreground">{plural(collection.runs.length, "run")}</span>
                  )}
                  {collection.id === current?.id && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {current && current.runs.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Runs of {current.name}</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {current.runs.map((item, index) => (
                    <DropdownMenuItem key={item.id} onSelect={() => onSelect({ collection: current.id, run: item.id })}>
                      <HistoryIcon />
                      {runLabel(item.report)}
                      {index === 0 && <span className="text-xs text-muted-foreground">latest</span>}
                      {item.id === run?.id && <CheckIcon className="ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => input.current?.click()}>
              <FolderPlusIcon />
              Add reports…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCloseAll}>
              <XIcon />
              Close all
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={input}
          type="file"
          multiple
          accept="application/json,.json"
          aria-label="Add report files"
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length) onAdd(files);
            event.target.value = "";
          }}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
