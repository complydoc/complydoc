import { FileJsonIcon } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Logo } from "@/components/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface OpenReportProps {
  onFile: (file: File) => void;
  onSample: () => void;
  /** Why the last file could not be opened, if it could not. */
  error?: string | undefined;
}

/** The empty state: drop a report, pick one, or look at the sample. */
export function OpenReport({ onFile, onSample, error }: OpenReportProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-8">
      <Logo height={40} />
      <Empty
        className={cn("max-w-md flex-none border bg-card py-10 transition-colors", dragging && "border-primary bg-success-soft")}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileJsonIcon />
          </EmptyMedia>
          <EmptyTitle>
            <h1 className="text-lg">Open a report</h1>
          </EmptyTitle>
          <EmptyDescription>Drop the JSON complydoc wrote, or choose it.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            aria-label="Report file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
            }}
          />
          <Button onClick={() => input.current?.click()}>Choose file</Button>
          <Button variant="link" onClick={onSample}>
            Open the sample
          </Button>
        </EmptyContent>
      </Empty>
      {error && (
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p className="text-xs text-faint">The file is read in this browser and goes nowhere else.</p>
    </main>
  );
}
