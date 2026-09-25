import { FileJsonIcon } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Logo } from "@/components/Logo";
import { ModeToggle } from "@/components/ModeToggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { LocalState } from "@/hooks/useLocalReports";
import { cn } from "@/lib/utils";
import { SAMPLES } from "./samples";

interface OpenReportProps {
  dark: boolean;
  onToggleTheme: () => void;
  /** Several at once open as several folders, or as runs of one folder. */
  onFiles: (files: File[]) => void;
  onSamples: (ids: string[]) => void;
  /** Why the last file could not be opened, if it could not. */
  error?: string | undefined;
  /** Set when `complydoc ui` served the page and found no reports to open. */
  local?: LocalState | undefined;
}

/** The empty state: drop a report, pick one, or look at the sample. */
export function OpenReport({ dark, onToggleTheme, onFiles, onSamples, error, local }: OpenReportProps) {
  const served = local !== undefined && local.status !== "off";
  const where = local?.sources.join(", ") || ".complydoc";
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (files.length) onFiles(files);
  }

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-8">
      <div className="absolute top-3 right-4">
        <ModeToggle dark={dark} onToggle={onToggleTheme} />
      </div>
      <Logo size={36} />
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
            <h1 className="text-lg">{served ? "No reports yet" : "Open a report"}</h1>
          </EmptyTitle>
          <EmptyDescription>
            {served ? (
              <>
                There are no reports in <code className="font-mono">{where}</code>. Run{" "}
                <code className="font-mono">complydoc audit ./documents</code>, then reload this page. Or drop a
                report JSON here.
              </>
            ) : (
              "Drop the JSON complydoc wrote, or choose it. Several at once open side by side, one folder each."
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <input
            ref={input}
            type="file"
            multiple
            accept="application/json,.json"
            aria-label="Report files"
            className="sr-only"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              if (files.length) onFiles(files);
            }}
          />
          <Button onClick={() => input.current?.click()}>Choose file</Button>
          {SAMPLES.length > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-xs text-muted-foreground">or open a sample</span>
            {SAMPLES.map((sample) => (
              <Button key={sample.id} variant="link" size="sm" onClick={() => onSamples([sample.id])}>
                {sample.label}
              </Button>
            ))}
            <Button variant="link" size="sm" onClick={() => onSamples(["audit", "loaders"])}>
              Both, as two runs of one folder
            </Button>
          </div>
          )}
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
