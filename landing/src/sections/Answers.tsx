import { CheckIcon, MinusIcon } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { CommandTerminal } from "@/components/CommandTerminal";
import { RouteLegend, RouteMap } from "@/components/RouteMap";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROUTED_DOCUMENTS } from "@/data/routing";

const VISION_DOCS = ROUTED_DOCUMENTS.filter((doc) => doc.pages.some((page) => page.route !== "text"));

export function VisionAnswer() {
  return (
    <div className="flex flex-col gap-4">
      <RouteMap documents={VISION_DOCS} />
      <RouteLegend />
    </div>
  );
}

/** pdfplumber's reading of page 4 of the sample contract, lines 24 to 33, as it returned them. */
const SPLICED = `reasonable control. Confidential information reported within ten working days of month
shall be used only for the purpose of this end. Personal data shall be processed only on
agreement. The customer shall provide documented instructions from the controller.
access to its premises and systems as
reasonably required. The supplier shall 7. Confidentiality
comply with all applicable laws and good
7.1 Any change to the scope must be agreed
industry practice.
in writing by both parties before work begins.`;

export function SectionAnswer() {
  return <CodeBlock title="pdfplumber, page 4 of a two-column contract" lang="text" output code={SPLICED} />;
}

export function CostAnswer() {
  return (
    <CommandTerminal
      lines={[
        { command: "complydoc cost ./documents -m claude-sonnet-5" },
        { output: "Documents        6 (33 pages)" },
        { output: "Text path        $0.0359" },
        { output: "Vision path      $0.1056" },
      ]}
    />
  );
}

const MASK = `from langchain_pymupdf4llm import PyMuPDF4LLMLoader
from complydoc.integrations.langchain import as_transformer
import complydoc as cd

mask = as_transformer(cd.MaskIdentifiers(metadata=True))
docs = mask.transform_documents(PyMuPDF4LLMLoader("contract.pdf").load())`;

export function MaskAnswer() {
  return <CodeBlock title="ingest.py" lang="python" code={MASK} />;
}

const LOADERS = ["pypdf", "pdfplumber", "docx2txt"] as const;

/** Which loaders read each file type in a mixed folder; the rest skipped it. */
const FILE_TYPES: { type: string; read: readonly string[]; use: string | null }[] = [
  { type: "PDF", read: ["pypdf", "pdfplumber"], use: "pypdf" },
  { type: "Word", read: ["docx2txt"], use: "docx2txt" },
  { type: "Excel", read: [], use: null },
];

export function FileTypeAnswer() {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Type</TableHead>
            <TableHead>Use</TableHead>
            {LOADERS.map((loader) => (
              <TableHead key={loader} className="font-mono">
                {loader}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {FILE_TYPES.map((row) => (
            <TableRow key={row.type}>
              <TableCell className="pl-4 font-medium">{row.type}</TableCell>
              <TableCell>
                {row.use ? (
                  <Badge variant="secondary" className="font-mono">
                    {row.use}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">none</span>
                )}
              </TableCell>
              {LOADERS.map((loader) => (
                <TableCell key={loader}>
                  {row.read.includes(loader) ? (
                    <CheckIcon aria-label="read" className="size-4 text-primary" />
                  ) : (
                    <MinusIcon aria-label="skipped" className="size-4 text-muted-foreground/60" />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
