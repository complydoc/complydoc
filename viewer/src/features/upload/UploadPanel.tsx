import { CheckIcon, FileUpIcon } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fromDrop, fromInput, pick, type Dropped, type Picked, type UploadState } from "@/hooks/useUpload";
import { cn } from "@/lib/utils";
import { plural } from "@/report/format";

interface UploadPanelProps {
  upload: UploadState;
  onStart: (picked: Picked) => void;
}

/**
 * Documents or a folder, dropped or chosen, sent to `complydoc ui` on this machine to audit;
 * then how far it is, file by file.
 */
export function UploadPanel({ upload, onStart }: UploadPanelProps) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function take(dropped: Dropped[]) {
    const picked = pick(dropped);
    if (!picked.documents.length) {
      setNote(dropped.length ? "None of those are documents complydoc reads." : null);
      return;
    }
    setNote(picked.skipped ? `${plural(picked.skipped, "file")} left out: not documents complydoc reads.` : null);
    onStart(picked);
  }

  async function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    take(await fromDrop(event.dataTransfer));
  }

  if (upload.phase === "sending" || upload.phase === "reading") {
    const sending = upload.phase === "sending";
    const [at, of] = sending ? [upload.sent, upload.files] : [upload.done, upload.total];
    return (
      <div className="flex w-full flex-col gap-2" role="status" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">{sending ? "Sending" : "Reading"}</span>
          <span className="text-muted-foreground tabular-nums">
            {at} of {of}
          </span>
        </div>
        <Progress value={of ? (at / of) * 100 : 0} aria-label={sending ? "Sent" : "Read"} />
        <span className="truncate text-xs text-muted-foreground">
          {sending ? upload.name : upload.current || "Starting"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {upload.phase === "done" && (
        <p className="flex items-center gap-2 text-sm">
          <CheckIcon className="size-4 shrink-0 text-success" aria-hidden="true" />
          Audited {upload.name}: {plural(upload.total, "document")}
        </p>
      )}
      {upload.phase === "failed" && (
        <Alert variant="destructive">
          <AlertDescription>{upload.error}</AlertDescription>
        </Alert>
      )}
      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
          dragging && "border-primary bg-success-soft",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => void drop(event)}
      >
        <FileUpIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm">Drop documents or a folder</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={() => files.current?.click()}>
            Choose files
          </Button>
          <Button size="sm" variant="outline" onClick={() => folder.current?.click()}>
            Choose folder
          </Button>
        </div>
      </div>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <input
        ref={files}
        type="file"
        multiple
        aria-label="Documents"
        className="sr-only"
        onChange={(event) => {
          take(fromInput(event.target.files));
          event.target.value = "";
        }}
      />
      <input
        ref={folder}
        type="file"
        aria-label="Folder of documents"
        className="sr-only"
        {...{ webkitdirectory: "" }}
        onChange={(event) => {
          take(fromInput(event.target.files));
          event.target.value = "";
        }}
      />
    </div>
  );
}
