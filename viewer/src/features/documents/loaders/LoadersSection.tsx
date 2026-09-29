import { ArrowRightIcon } from "lucide-react";
import { Section } from "@/components/Section";
import { ToneBadge } from "@/components/ToneBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fileName, formatCount, formatPercent, formatSeconds, plural } from "@/report/format";
import { loaderView, type LoaderFigures, type TypeDecision } from "@/report/loaderView";
import type { LoaderComparison } from "@/report/loaderTypes";
import { documentHref } from "@/report/route";
import { agreementTone } from "@/report/select";
import type { Report } from "@/report/types";

/** Documents read differently listed by name before the rest are counted. */
const DIFFERING_SHOWN = 5;

const numeric = "text-right tabular-nums";

function LoaderRowCells({ report, loader, facts }: { report: Report; loader: LoaderFigures; facts: boolean }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{loader.name}</TableCell>
      <TableCell className={numeric}>
        {formatCount(loader.read)}
        {loader.failed > 0 && <span className="text-destructive"> · failed on {formatCount(loader.failed)}</span>}
      </TableCell>
      <TableCell className={numeric}>
        {loader.similarity === null ? (
          <span className="text-muted-foreground">baseline</span>
        ) : (
          <ToneBadge tone={agreementTone(report.thresholds, loader.similarity)}>
            {formatPercent(loader.similarity)}
          </ToneBadge>
        )}
      </TableCell>
      <TableCell className={cn(numeric, loader.missedHigh > 0 && "text-destructive")}>
        {loader.missed === 0 ? (
          <span className="text-muted-foreground">none</span>
        ) : (
          <>
            {formatCount(loader.missed)}
            {loader.missedHigh > 0 && ` · ${formatCount(loader.missedHigh)} high`}
          </>
        )}
      </TableCell>
      {facts && (
        <TableCell className={numeric}>
          {loader.facts ? `${formatCount(loader.facts.kept)} of ${formatCount(loader.facts.of)}` : "–"}
        </TableCell>
      )}
      <TableCell className={cn(numeric, "text-muted-foreground")}>
        {loader.seconds === null ? "–" : formatSeconds(loader.seconds)}
      </TableCell>
    </TableRow>
  );
}

function Figures({ report, type }: { report: Report; type: TypeDecision }) {
  const facts = type.loaders.some((l) => l.facts !== null);
  return (
    <Table aria-label={`Loaders on ${type.label}`}>
      <TableHeader>
        <TableRow>
          <TableHead>Loader</TableHead>
          <TableHead className="text-right">Files read</TableHead>
          <TableHead className="text-right">Alike</TableHead>
          <TableHead className="text-right" title="Identifiers another loader kept and this one lost">
            Identifiers lost
          </TableHead>
          {facts && <TableHead className="text-right">Facts kept</TableHead>}
          <TableHead className="text-right">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {type.loaders.map((loader) => (
          <LoaderRowCells key={loader.name} report={report} loader={loader} facts={facts} />
        ))}
      </TableBody>
    </Table>
  );
}

function Differing({ report, type }: { report: Report; type: TypeDecision }) {
  const shown = type.differing.slice(0, DIFFERING_SHOWN);
  const more = type.differing.length - shown.length;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">
        Read differently{" "}
        <span className="font-normal text-muted-foreground">
          · {plural(type.differing.length, "file")}, least alike first; open one to see the diff
        </span>
      </p>
      <ul className="flex flex-col divide-y rounded-lg border">
        {shown.map((file) => (
          <li key={file.index}>
            <a
              href={documentHref(file.index)}
              className="group flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
              title={file.path}
            >
              <span className="min-w-0 flex-1 truncate">{fileName(file.path)}</span>
              <span className="text-xs text-muted-foreground">{file.reader}</span>
              <ToneBadge tone={agreementTone(report.thresholds, file.similarity)}>
                {formatPercent(file.similarity)} alike
              </ToneBadge>
              <ArrowRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <a href="#documents" className="self-start text-xs text-muted-foreground hover:text-foreground">
          and {formatCount(more)} more in Documents
        </a>
      )}
    </div>
  );
}

function TypeCard({ report, type }: { report: Report; type: TypeDecision }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline gap-2">
          {type.label}
          <span className="text-sm font-normal text-muted-foreground">{plural(type.files, "file")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Figures report={report} type={type} />
        {type.differing.length > 0 && <Differing report={report} type={type} />}
        {type.factsMissed.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {type.factsMissed.map((miss) => (
              <li key={miss.fact} className="text-muted-foreground">
                <span className="text-foreground">“{miss.fact}”</span> not kept by {miss.missedBy.join(", ")}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The loaders side by side for each file type: how alike their text is, what they lost,
 * what they failed on, and the files they read differently, each a link to its diff.
 * Which one to use is the engineer's call, so no loader is picked here. A type only one
 * loader read has nothing to compare, and is named in a line.
 */
export function LoadersSection({ report, comparison }: { report: Report; comparison: LoaderComparison }) {
  const view = loaderView(report, comparison);
  return (
    <Section title="Loaders compared">
      <div className="flex flex-col gap-4">
        {view.decided.map((type) => (
          <TypeCard key={type.key} report={report} type={type} />
        ))}
        {(view.only.length > 0 || view.unread.length > 0) && (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {view.only.length > 0 && (
              <p>
                One loader each:{" "}
                {view.only.map((type, index) => (
                  <span key={type.label}>
                    {index > 0 && ", "}
                    <span className="text-foreground">{type.label}</span> by {type.loader}
                  </span>
                ))}
                .
              </p>
            )}
            {view.unread.length > 0 && <p>No loader was meant for {view.unread.join(", ")}.</p>}
          </div>
        )}
      </div>
    </Section>
  );
}
