import { CodeBlock } from "@/components/CodeBlock";
import { RouteLegend, RouteMap } from "@/components/RouteMap";
import { Badge } from "@/components/ui/badge";
import { ROUTED_DOCUMENTS } from "@/data/routing";

const VISION_DOCS = ROUTED_DOCUMENTS.filter((doc) => doc.pages.some((page) => page.route !== "text"));

export function VisionAnswer() {
  return (
    <div className="flex flex-col gap-5">
      <RouteMap documents={VISION_DOCS} />
      <RouteLegend />
      <CodeBlock
        title="complydoc routing ./documents"
        lang="text"
        output
        code={`Route   Pages  Documents
text       29          4
ocr         0          0
vision      4          2

Every page                              Cost
by the route it needs                $0.0477
from its text layer                  $0.0359
as an image to a vision model        $0.1056`}
      />
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
in writing by both parties before work begins.
6.2 On termination the supplier shall return Notices must be given in writing to the`;

const FACTS = `report = cd.compare_loaders(
    {"pdfplumber": PDFPlumberLoader, "pypdf": PyPDFLoader},
    paths="./contracts",
    facts=["Any change to the scope must be agreed in writing"],
)
report.loader_comparison.facts   # found, per loader, and the passage it got instead`;

export function SectionAnswer() {
  return (
    <div className="flex flex-col gap-5">
      <CodeBlock title="pdfplumber · master-services-agreement.pdf · page 4" lang="text" output code={SPLICED} />
      <p className="text-sm text-muted-foreground">
        The heading lands at the end of a sentence from section 6, and clause 7.1 alternates with 6.1 and 6.2. A chunker
        splits that into passages that belong to neither section. pypdf reads the same page in column order.
      </p>
      <CodeBlock title="facts.py" lang="python" code={FACTS} />
    </div>
  );
}

export function CostAnswer() {
  return (
    <CodeBlock
      title="complydoc cost ./documents -m claude-sonnet-5 --monthly-volume 20000"
      lang="text"
      output
      code={`Documents        6 (33 pages)
Text path        $0.0359
Vision path      $0.1056
Annual (text)    $1,724.74
Annual (vision)  $4,224.00`}
    />
  );
}

/** What `complydoc audit` found in the sample folder, by kind. */
const FOUND = [
  ["Email address", 12],
  ["Phone number", 12],
  ["National Insurance number", 5],
  ["German tax ID", 3],
  ["IBAN", 2],
  ["UK sort code", 2],
  ["UK bank account", 2],
  ["UK postcode", 2],
  ["Payment card", 1],
  ["Street address", 1],
] as const;

const MASK = `from complydoc.integrations.langchain import as_transformer
import complydoc as cd

steps = [cd.MaskIdentifiers(metadata=True), cd.DropHiddenPassages(), cd.StripPathMetadata()]
docs = PyPDFLoader("contract.pdf").load()
for step in steps:
    docs = as_transformer(step).transform_documents(docs)`;

export function MaskAnswer() {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-wrap gap-2">
        {FOUND.map(([label, count]) => (
          <li key={label}>
            <Badge variant="secondary">
              {label} <span className="font-mono text-muted-foreground">{count}</span>
            </Badge>
          </li>
        ))}
      </ul>
      <CodeBlock title="ingest.py" lang="python" code={MASK} />
      <CodeBlock title="or, for files on disk" lang="bash" code="complydoc clean ./documents --out clean/" />
    </div>
  );
}
