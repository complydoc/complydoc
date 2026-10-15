import { FlaskConicalIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useEvalsState } from "@/hooks/useEvals";
import { toast } from "@/lib/toast";

/** Where a reading's text is on the page: a selection anywhere else is not a passage of the document. */
const READING = '[data-testid="page-reading"]';

interface Picked {
  text: string;
  top: number;
  left: number;
}

/** The passage selected in the document's text, tidied as the evals file keeps it, and where it sits. */
function picked(): Picked | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const within = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest(READING);
  if (!within(range.startContainer) || !within(range.endContainer)) return null;
  const text = selection.toString().split(/\s+/).filter(Boolean).join(" ");
  if (text.length < 3) return null;
  const box = range.getBoundingClientRect();
  return { text, top: box.bottom + 6, left: box.left + box.width / 2 };
}

/**
 * Select a passage in the document's text and expect it: every reading of the document must
 * then come out with it. The lab's way of labelling, in place of pasting passages into a file.
 * Shown where the folder's evals file can be written, which is under `complydoc ui`.
 */
export function ExpectSelection({ document: path }: { document: string }) {
  const { editable, add } = useEvalsState();
  const [selection, setSelection] = useState<Picked | null>(null);

  useEffect(() => {
    if (!editable) return;
    // After the pointer is let go, so the button does not chase a selection being made.
    const read = () => window.setTimeout(() => setSelection(picked()), 0);
    const clear = () => {
      if (window.getSelection()?.isCollapsed) setSelection(null);
    };
    window.document.addEventListener("mouseup", read);
    window.document.addEventListener("keyup", read);
    window.document.addEventListener("selectionchange", clear);
    return () => {
      window.document.removeEventListener("mouseup", read);
      window.document.removeEventListener("keyup", read);
      window.document.removeEventListener("selectionchange", clear);
    };
  }, [editable]);

  if (!editable || !selection) return null;

  const expect = async () => {
    // A masked value is dots here and digits in the document: it would never be found.
    if (selection.text.includes("•")) {
      toast("That passage holds a masked value. Pick one without it.");
      return;
    }
    if (await add({ text: selection.text, document: path })) {
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    }
  };

  return createPortal(
    <div
      className="fixed z-50 -translate-x-1/2"
      style={{ top: selection.top, left: selection.left }}
      // Pressing the button must not clear the selection it is about.
      onMouseDown={(event) => event.preventDefault()}
    >
      <Button size="sm" className="shadow-md" onClick={() => void expect()}>
        <FlaskConicalIcon />
        Expect this passage
      </Button>
    </div>,
    window.document.body,
  );
}
