import { CodeBlock, Source } from "@/components/CodeBlock";
import { Section, TextLink } from "@/components/Section";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { links } from "@/links";

const COMPARE = `from langchain_community.document_loaders import PDFPlumberLoader, PyPDFLoader
import complydoc as cd

report = cd.compare_loaders(
    {"pypdf": PyPDFLoader, "pdfplumber": PDFPlumberLoader},
    paths="./documents",
    facts=["Expenses must be claimed within three months"],
)
report.to_pandas("loaders")`;

const INSPECT = `from langchain_community.document_loaders import PyPDFLoader
import complydoc as cd

# Any loader with a load method, or any callable, works the same way.
report = cd.inspect_documents(PyPDFLoader("contract.pdf"))

report.loader.network_attempts   # connections it tried to open
report.loader.metadata_keys      # what it attached to each document
report.documents[0].path_exposures`;

const CHUNKS = `import complydoc as cd
from langchain_text_splitters import RecursiveCharacterTextSplitter

comparison = cd.compare_chunkers(
    {"800": RecursiveCharacterTextSplitter(chunk_size=800),
     "2000": RecursiveCharacterTextSplitter(chunk_size=2000)},
    PyPDFLoader("contract.pdf"),
    facts=["Payment is due within thirty days"],
)
comparison.rows()   # tiny, oversized, split sentences and tables, facts split`;

/** From running COMPARE on viewer/sample/documents. */
const LOADERS = [
  { name: "pypdf", characters: "86,657", seconds: "0.24", identifiers: 42, readiness: "93.2", facts: "1/1", network: 0 },
  { name: "pdfplumber", characters: "86,680", seconds: "3.24", identifiers: 42, readiness: "93.7", facts: "1/1", network: 0 },
];

const SIMILARITY = [
  { file: "annual-report-2025.pdf", value: 97.7 },
  { file: "employee-handbook.pdf", value: 91.5 },
  { file: "master-services-agreement.pdf", value: 29.8 },
  { file: "vendor-due-diligence.pdf", value: 88.4 },
];

export function Loaders() {
  return (
    <Section
      id="loaders"
      label="loaders and chunks"
      title="Test the loader, not only the file"
      lead={
        <>
          Your pipeline never sees the PDF. It sees what PyPDFLoader or Docling or LlamaParse made of it. complydoc
          inspects that output directly: the text, the metadata attached to it, the connections the loader tried to
          open, and where several loaders disagree.
        </>
      }
    >
      <div className="grid gap-8 *:min-w-0 lg:grid-cols-[1.1fr_1fr]">
        <Tabs defaultValue="compare">
          <TabsList>
            <TabsTrigger value="compare">Compare loaders</TabsTrigger>
            <TabsTrigger value="inspect">Inspect one</TabsTrigger>
            <TabsTrigger value="chunks">Chunks</TabsTrigger>
          </TabsList>
          <TabsContent value="compare">
            <CodeBlock title="compare.py" copy={COMPARE}>
              <Source code={COMPARE} />
            </CodeBlock>
          </TabsContent>
          <TabsContent value="inspect">
            <CodeBlock title="inspect.py" copy={INSPECT}>
              <Source code={INSPECT} />
            </CodeBlock>
          </TabsContent>
          <TabsContent value="chunks">
            <CodeBlock title="chunks.py" copy={CHUNKS}>
              <Source code={CHUNKS} />
            </CodeBlock>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-6 lg:pt-10">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>loader</TableHead>
                  <TableHead className="text-right">characters</TableHead>
                  <TableHead className="text-right">seconds</TableHead>
                  <TableHead className="text-right">identifiers</TableHead>
                  <TableHead className="text-right">readiness</TableHead>
                  <TableHead className="text-right">facts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="font-mono text-xs">
                {LOADERS.map((loader) => (
                  <TableRow key={loader.name}>
                    <TableCell>{loader.name}</TableCell>
                    <TableCell className="text-right">{loader.characters}</TableCell>
                    <TableCell className="text-right">{loader.seconds}</TableCell>
                    <TableCell className="text-right">{loader.identifiers}</TableCell>
                    <TableCell className="text-right">{loader.readiness}</TableCell>
                    <TableCell className="text-right">{loader.facts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">pdfplumber against pypdf, words in common</p>
            <ul className="flex flex-col gap-2">
              {SIMILARITY.map((row) => (
                <li key={row.file} className="grid grid-cols-[1fr_7rem_3.5rem] items-center gap-3 text-sm">
                  <span className="truncate font-mono text-xs text-muted-foreground">{row.file}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className={row.value < 50 ? "block h-full bg-destructive" : "block h-full bg-chart-2"}
                      style={{ width: `${row.value}%` }}
                    />
                  </span>
                  <span className="text-right font-mono text-xs">{row.value.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              The totals agree to within 23 characters. On the two-column contract, the two readings share under a
              third of their words.{" "}
              <Badge variant="outline">0 network attempts</Badge>
            </p>
          </div>
        </div>
      </div>
      <p className="mt-10 text-sm text-muted-foreground">
        Presets for Docling, Unstructured, LlamaParse and Azure Document Intelligence. Hosted parsers run only with{" "}
        <code className="font-mono text-xs">allow_network=True</code>. <TextLink href={links.compareLoaders}>Comparing loaders</TextLink>{" "}
        · <TextLink href={links.chunks}>Inspecting chunks</TextLink>
      </p>
    </Section>
  );
}
