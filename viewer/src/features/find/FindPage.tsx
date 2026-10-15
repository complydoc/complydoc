import { ScanSearchIcon } from "lucide-react";
import { useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { FolderRunsContext } from "@/hooks/useFolderRuns";
import { localConfig } from "@/hooks/useLocalReports";
import { plural } from "@/report/format";
import { findValue, tally, type Trail } from "@/report/findValue";
import { RunCard } from "./RunCard";

/** The newest runs open on their steps; the rest are a click away. */
const OPEN_AT_FIRST = 2;

function Summary({ trail }: { trail: Trail }) {
  const { sent, stopped } = tally(trail);
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
      <p className="flex items-baseline gap-2">
        <span className="font-heading text-lg font-semibold tracking-tight">{trail.label ?? "Identifier"}</span>
        <span className="font-mono text-sm">{trail.masked}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        In {plural(trail.runs.length, "run")} of {plural(trail.reports_searched, "report")}
      </p>
      {sent > 0 && <p className="text-sm text-destructive">Sent to a host in {plural(sent, "run")}</p>}
      {stopped > 0 && <p className="text-sm text-success">Stopped inside the pipeline in {plural(stopped, "run")}</p>}
    </div>
  );
}

/**
 * Where a value went. Type an identifier as it is written; the server hashes it and searches
 * every report it serves for the hash, so the answer comes from reports that never held the
 * value, and the value is kept nowhere. Each run that held it is listed with its steps, as the
 * trace lists them, down to the one after which it was gone.
 */
export function FindPage() {
  const [served] = useState(() => localConfig() !== null);
  const { runs, open } = useContext(FolderRunsContext);
  const [value, setValue] = useState("");
  const [trail, setTrail] = useState<Trail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!served)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ScanSearchIcon />
          </EmptyMedia>
          <EmptyTitle>Finding a value needs complydoc ui</EmptyTitle>
          <EmptyDescription>
            It searches every run in a folder, which a report opened on its own cannot do. Open the folder with
            complydoc ui.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const find = async () => {
    setBusy(true);
    setError(null);
    try {
      setTrail(await findValue(value));
    } catch (reason) {
      setTrail(null);
      setError(reason instanceof Error ? reason.message : "complydoc ui could not be reached.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <form
          className="flex max-w-2xl gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void find();
          }}
        >
          <Input
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label="The value to find"
            placeholder="An account number, a name, an email address…"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button type="submit" disabled={busy || !value.trim()}>
            Find
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">
          Every document, step and host an identifier reached, across all the runs here. What you type is hashed to
          search and is not kept.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {trail && !trail.found && (
        <p className="text-sm text-muted-foreground">
          Not found in {plural(trail.reports_searched, "report")}. A value is found only where a run looked for its kind
          and read it as it is written here.
        </p>
      )}
      {trail?.found && (
        <>
          <Summary trail={trail} />
          <ul className="flex flex-col gap-3">
            {trail.runs.map((run, index) => {
              const loaded = runs.find((r) => r.name === run.report);
              return (
                <RunCard
                  key={run.report}
                  run={run}
                  open={index < OPEN_AT_FIRST}
                  {...(loaded ? { onOpen: () => open(loaded.id) } : {})}
                />
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
