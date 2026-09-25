import { FlaskConicalIcon, WorkflowIcon } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { CodeTabs, type CodeTab } from "@/components/CodeTabs";
import { Section, TextLink } from "@/components/Section";
import { links, VERSION } from "@/links";

const TABS: CodeTab[] = [
  {
    value: "langchain",
    label: "LangChain",
    icon: <BrandLogo brand="langchain" />,
    lang: "python",
    code: `from langchain_community.document_loaders import PyPDFLoader
from complydoc.integrations.langchain import as_transformer
import complydoc as cd

loader = PyPDFLoader("contract.pdf")
report = cd.inspect_documents(loader)       # what it read, attached and tried to reach
report.loader.network_attempts
report.loader.metadata_keys

mask = as_transformer(cd.MaskIdentifiers(metadata=True))
docs = mask.transform_documents(loader.load())`,
    note: "Any loader with load(), load_data() or lazy_load() works the same way, or any callable that returns documents.",
  },
  {
    value: "llamaindex",
    label: "LlamaIndex",
    icon: <BrandLogo brand="llamaindex" />,
    lang: "python",
    code: `from llama_index.core import SimpleDirectoryReader
from llama_index.core.ingestion import IngestionPipeline
from complydoc.integrations.llamaindex import as_transform
import complydoc as cd

reader = SimpleDirectoryReader("./documents")
report = cd.inspect_documents(reader)

pipeline = IngestionPipeline(transformations=[
    as_transform(cd.MaskIdentifiers()),
    as_transform(cd.DropHiddenPassages()),
    splitter,
    embed_model,
])`,
    note: "Each step records what it changed, and in which document, in step.changes.",
  },
  {
    value: "local",
    label: "Docling & Unstructured",
    icon: <BrandLogo brand="docling" />,
    lang: "python",
    code: `import complydoc as cd

report = cd.compare_loaders(
    {
        "pypdf": PyPDFLoader,
        "docling": cd.parsers.docling(),
        "unstructured": cd.parsers.unstructured(strategy="hi_res"),
    },
    paths="./documents",
    facts=["Payment is due within thirty days"],
)
report.to_pandas("loaders")   # text, identifiers, facts, failures and time per loader`,
    note: "The first loader is the baseline; every other one is measured against it, document by document and page by page.",
  },
  {
    value: "hosted",
    label: "LlamaParse & Azure",
    icon: <BrandLogo brand="azure" />,
    lang: "python",
    code: `report = cd.compare_loaders(
    {
        "pypdf": PyPDFLoader,
        "llamaparse": cd.parsers.llamaparse(tier="agentic"),
        "azure": cd.parsers.azure_document_intelligence(endpoint=ENDPOINT, api_key=KEY),
    },
    paths="./documents",
    allow_network=True,   # hosted parsers run only when you say so
    cache_dir=".cache",   # parse each file once, compare as often as you like
)`,
    note: "Hosted parsers are priced per page from their published rates, so the table shows what each reading cost.",
  },
  {
    value: "pytest",
    label: "pytest",
    icon: <FlaskConicalIcon />,
    lang: "python",
    code: `import complydoc as cd

def test_documents_are_safe_to_index():
    report = cd.full_audit("./documents")
    (cd.expect(report)
        .no_hidden(severity="high")
        .no_failures()
        .no_regressions("baseline.json"))`,
    note: "A failing expectation lists every document and page that broke it.",
  },
  {
    value: "ci",
    label: "GitHub Actions",
    icon: <WorkflowIcon />,
    lang: "yaml",
    code: `on:
  pull_request:
    paths: ["documents/**", "policy.yaml"]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: complydoc/complydoc@v${VERSION}
        with:
          path: documents
          policy: policy.yaml
          sarif: true   # failures in code scanning`,
    note: "It comments a summary on the pull request, and exits non-zero when a rule in policy.yaml fails.",
  },
];

export function Integrations() {
  return (
    <Section
      id="integrations"
      eyebrow="Integrations"
      title="Drops into the pipeline you already have."
      lead="complydoc reads documents by shape, so it needs no adapter for your loader, and imports no framework it does not need. Point it at a loader, a folder or a list of documents."
    >
      <CodeTabs tabs={TABS} />
      <p className="mt-6 text-sm text-muted-foreground">
        <TextLink href={links.api}>Python API</TextLink> · <TextLink href={links.cli}>Command line</TextLink> ·{" "}
        <TextLink href={links.playground}>Runnable examples</TextLink>
      </p>
    </Section>
  );
}
