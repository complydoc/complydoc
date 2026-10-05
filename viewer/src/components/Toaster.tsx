import { CheckIcon, InfoIcon } from "lucide-react";
import { Toast } from "radix-ui";
import { useEffect, useState } from "react";
import { onToast, type Note } from "@/lib/toast";

/** Where `toast` shows its notes; mounted once, at the root. */
export function Toaster() {
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(() => {
    // At most three at once: a burst of copies should not stack up the screen.
    return onToast((note) => setNotes((current) => [...current.slice(-2), note]));
  }, []);
  return (
    <Toast.Provider swipeDirection="right" duration={2400}>
      {notes.map((note) => (
        <Toast.Root
          key={note.id}
          onOpenChange={(open) => !open && setNotes((current) => current.filter((n) => n.id !== note.id))}
          className="flex items-center gap-2 rounded-lg bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[swipe=end]:animate-out data-[swipe=end]:fade-out-0"
        >
          {note.tone === "done" ? (
            <CheckIcon className="size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <InfoIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <Toast.Title>{note.message}</Toast.Title>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed right-4 bottom-4 z-[100] flex w-max max-w-[min(24rem,calc(100vw-2rem))] flex-col items-end gap-2 outline-none" />
    </Toast.Provider>
  );
}
