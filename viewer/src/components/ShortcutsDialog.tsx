import { GO_KEY, PAGE_INFO, PAGES } from "@/app/pages";
import { Keys } from "@/components/Keys";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { shortcut } from "@/lib/shortcut";

const MOD = shortcut("").trim();

interface Group {
  title: string;
  rows: { label: string; keys: string[] }[];
}

const GROUPS: Group[] = [
  {
    title: "General",
    rows: [
      { label: "Go to a page, document or run", keys: [MOD, "K"] },
      { label: "Fold the sidebar", keys: [MOD, "B"] },
      { label: "Show these shortcuts", keys: ["?"] },
    ],
  },
  {
    title: "Go to",
    rows: PAGES.map((page) => ({ label: PAGE_INFO[page].label, keys: ["G", GO_KEY[page]] })),
  },
  {
    title: "Trace",
    rows: [
      { label: "Next or previous call", keys: ["J", "K"] },
      { label: "Fold or open a call", keys: ["←", "→"] },
      { label: "Close the trace", keys: ["Esc"] },
    ],
  },
  {
    title: "Review",
    rows: [{ label: "Next or previous finding", keys: ["J", "K"] }],
  },
];

/** Every shortcut the viewer has, grouped by where it works. ? opens it from any page. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything here works without leaving the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{group.title}</h3>
              <ul className="flex flex-col">
                {group.rows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                    <span>{row.label}</span>
                    <Keys keys={row.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
