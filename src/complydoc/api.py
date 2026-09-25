"""The Python API.

    import complydoc as cd

    report = cd.security_audit("~/contracts")
    for document in report.documents:
        for match in document.sensitive.matches:
            print(document.relative_path, match.label, match.evidence, match.masked)

`extract_text` is the other direction: not what the folder is like, but the
folder's own words with every identifier covered over, chunked, counted in
tokens, and carrying a list of what could not be read.

Readers are pluggable, and the registration hooks are public. `register_extractor`
takes a class satisfying `Extractor` and complydoc will use it like its own;
`register_engine` does the same for OCR, and `register_loader` teaches it a
whole file format nothing here handles yet:

    class MarkdownLoader:
        extensions = (".md",)
        format = cd.DocumentFormat.OTHER

        def load(self, path, options):
            document = cd.Document(path=path, sha256=cd.sha256_of(path), format=self.format)
            page = cd.Page(number=1, width_pt=595.0, height_pt=842.0)
            page.text = path.read_text()
            page.text_source = "native"
            document.pages.append(page)
            return document

    cd.register_loader(MarkdownLoader())

`Document`, `Page`, `Rect` and the other types a loader uses are exported for
this.

Four audit entry points, one per way of asking. `full_audit` runs everything;
the other three run one component each. The identifier scan alone loads no
tokenizer and prices nothing, and is several times quicker.

The three exceptions are exported because a caller has to be able to catch
them by name: `ConfigError` for a configuration that will not load,
`UnknownModelError` for a model with no price, and
`NetworkAccessError` if anything in the run reaches for the network. A missing
path raises `FileNotFoundError`.

Everything named in `complydoc.__all__` is the public surface, and the report
objects it returns are part of it. Anything else in the package is internal and
may be renamed without notice. The shape of a report is versioned:
`report.run.schema_version` moves when it changes, exactly as it does for the
JSON, so code can branch on it.

Two differences from the command line:

- The network guard is scoped. The CLI arms it for the life of the process; here
  it is armed for the audit and the socket module is restored afterwards.
- `jobs` defaults to 1. The CLI chooses a worker count from the folder size.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Callable, Iterator, Sequence
from pathlib import Path
from typing import TYPE_CHECKING, Literal, TypedDict, Unpack

from complydoc import offline
from complydoc.audit.run import COMPONENTS, iter_entries, plan_audit, run_audit
from complydoc.cleaning import CleanResult, clean_document
from complydoc.config.loader import ConfigError, load_config
from complydoc.cost.estimator import UnknownModelError
from complydoc.extraction.chunks import (
    ChunkComparison,
    ChunkReport,
    ChunkStats,
    FactLocation,
    InspectedChunk,
    compare_chunkers,
    inspect_chunks,
)
from complydoc.extraction.extract import Chunk, ExtractionWarning, TextResult, extract_text
from complydoc.extraction.facts import Fact, check_facts
from complydoc.extraction.retrieval import Question, QuestionResult
from complydoc.extraction.strings import (
    MaskedText,
    TextScan,
    count_tokens,
    find_hidden,
    mask_text,
    scan_text,
)
from complydoc.hidden.instructions import register_instruction_classifier
from complydoc.ingest.base import (
    Document,
    DocumentFormat,
    IngestOptions,
    Loader,
    LoaderError,
    Page,
    Rect,
    SkipRecord,
    TextBlock,
    sha256_of,
)
from complydoc.ingest.engines.base import Engine, Recognised
from complydoc.ingest.engines.registry import all_engines
from complydoc.ingest.engines.registry import register as register_engine
from complydoc.ingest.extractors.base import Extraction, Extractor, PageSource
from complydoc.ingest.extractors.registry import all_extractors
from complydoc.ingest.extractors.registry import register as register_extractor
from complydoc.ingest.registry import register as register_loader
from complydoc.ingest.registry import supported_extensions
from complydoc.loaders import parsers
from complydoc.loaders.compare import compare_loaders
from complydoc.loaders.inspection import inspect_documents
from complydoc.loaders.parsers import LoaderSpec
from complydoc.offline import NetworkAccessError
from complydoc.pipeline.steps import (
    DropHiddenPassages,
    MaskIdentifiers,
    Step,
    StepChange,
    StripPathMetadata,
)
from complydoc.readiness.base import Measurement, Signal
from complydoc.readiness.registry import register as register_signal
from complydoc.report.compare import Change, ReportDiff, diff_reports
from complydoc.report.expectations import Expectation, ExpectationError, expect
from complydoc.report.html_writer import write_html as _write_html
from complydoc.report.json_reader import load_report
from complydoc.report.json_writer import write_json as _write_json
from complydoc.report.models import (
    AuditReport,
    ContentFinding,
    DocumentReport,
    FactCheck,
    IdentifierDifference,
    LoaderComparison,
    LoaderRun,
    LoaderSummary,
    MetadataFinding,
)
from complydoc.report.pages import write_chunks_html, write_diff_html
from complydoc.sensitive.base import Detector, DetectorContext, Finding
from complydoc.sensitive.registry import register as register_detector
from complydoc.verification.vision import VisionModel, VisionPage, VisionReading
from complydoc.viewer import launch_ui

if TYPE_CHECKING:
    from complydoc.config.schema import Config

__all__ = [
    "AuditOptions",
    "AuditReport",
    "Change",
    "Chunk",
    "ChunkComparison",
    "ChunkReport",
    "ChunkStats",
    "CleanResult",
    "ConfigError",
    "ContentFinding",
    "Detector",
    "DetectorContext",
    "Document",
    "DocumentFormat",
    "DocumentReport",
    "DropHiddenPassages",
    "Engine",
    "Expectation",
    "ExpectationError",
    "Extraction",
    "ExtractionWarning",
    "Extractor",
    "Fact",
    "FactCheck",
    "FactLocation",
    "Finding",
    "IdentifierDifference",
    "IngestOptions",
    "InspectedChunk",
    "Loader",
    "LoaderComparison",
    "LoaderError",
    "LoaderRun",
    "LoaderSpec",
    "LoaderSummary",
    "MaskIdentifiers",
    "MaskedText",
    "Measurement",
    "MetadataFinding",
    "NetworkAccessError",
    "Page",
    "PageSource",
    "Question",
    "QuestionResult",
    "Recognised",
    "Rect",
    "ReportDiff",
    "Signal",
    "SkipRecord",
    "Step",
    "StepChange",
    "StripPathMetadata",
    "TextBlock",
    "TextResult",
    "TextScan",
    "UnknownModelError",
    "VisionModel",
    "VisionPage",
    "VisionReading",
    "aiter_audit",
    "all_engines",
    "all_extractors",
    "check_facts",
    "clean_document",
    "compare_chunkers",
    "compare_loaders",
    "cost_audit",
    "count_tokens",
    "diff_reports",
    "expect",
    "extract_text",
    "find_hidden",
    "full_audit",
    "inspect_chunks",
    "inspect_documents",
    "iter_audit",
    "launch_ui",
    "load_config",
    "load_report",
    "mask_text",
    "parsers",
    "readiness_audit",
    "register_detector",
    "register_engine",
    "register_extractor",
    "register_instruction_classifier",
    "register_loader",
    "register_signal",
    "scan_text",
    "security_audit",
    "sha256_of",
    "supported_extensions",
    "write_chunks_html",
    "write_diff_html",
    "write_html",
    "write_json",
]


class AuditOptions(TypedDict, total=False):
    """Everything the four entry points accept beyond the folder itself.

    One set for all of them. An option that does not apply to the components
    being run is ignored.
    """

    config: Config | None
    """A loaded configuration. `load_config()` is used when this is absent."""
    ocr: bool
    """Read pages with no text layer. Slower, and finds what a scan is hiding."""
    reveal: bool
    """Put identifiers in the report in full. Off, and the report says which it was."""
    recurse: bool
    password: str
    monthly_volume: int | None
    models: Sequence[str] | None
    """Price against these models instead of the configured comparison."""
    extractor: str | None
    compare_extractors: Sequence[str]
    compare_engines: Sequence[str]
    sample: int | None
    """Audit this many documents, keeping each file type's share of the folder."""
    jobs: int
    """Worker processes. 1 by default; 0 reads the folder and decides."""
    timeout: float | None
    """Seconds to give each document. A document still being read when the time
    passes is stopped and reported as skipped. Enforced by reading in a worker
    process, so a run with a timeout always uses one."""
    page_images: bool
    extracted_text: bool
    """Keep the text read off each page. It is the document, so it is off by default."""
    offline_guard: bool
    """Block outbound sockets for the duration. On, and only off for a caller
    who knows their process needs the network while this runs."""
    progress: Callable[[int, int, Path], None] | None
    """Called with (finished, total, path) as each document completes."""
    verify_with: VisionModel | str | None
    """Read pages again with a vision model of your own, and report where it disagrees.

    A callable taking a `VisionPage` and returning a `VisionReading` or the
    text, or a `"vision:module:function"` spec naming a factory for one. The
    page images go wherever that code sends them, and the report names the
    hosts. A callable keeps the run in one process; a spec crosses into
    workers. Nothing is verified by default.
    """
    verify_scope: Literal["flagged", "all"]
    """`flagged`, the default: the pages routing sent to vision, the pages with no
    usable reading, and the pages two readers disagreed about. `all`: every page."""


def _audit(
    target: str | os.PathLike[str],
    components: Sequence[str],
    options: AuditOptions,
) -> AuditReport:
    """The one implementation. The four public names differ only in components."""
    folder = Path(target).expanduser()
    # A command can print an error and exit; a library has to raise. Returning
    # an empty report for a path that is not there would read as "nothing was
    # found in these documents", which is a different and much worse answer.
    if not folder.exists():
        raise FileNotFoundError(f"no such file or folder: {folder}")
    config = options.get("config") or load_config()
    with offline.guarded(options.get("offline_guard", True)):
        return run_audit(
            folder,
            config,
            components,
            ocr=options.get("ocr", False),
            reveal=options.get("reveal", False),
            monthly_volume=options.get("monthly_volume"),
            select_models=options.get("models"),
            recurse=options.get("recurse", True),
            page_images=options.get("page_images", False),
            extracted_text=options.get("extracted_text", False),
            password=options.get("password", ""),
            extractor=options.get("extractor"),
            compare_extractors=tuple(options.get("compare_extractors") or ()),
            compare_engines=tuple(options.get("compare_engines") or ()),
            jobs=options.get("jobs", 1),
            sample=options.get("sample"),
            timeout=options.get("timeout"),
            verify_with=options.get("verify_with"),
            verify_scope=options.get("verify_scope", "flagged"),
            progress=options.get("progress"),
        )


def full_audit(target: str | os.PathLike[str], **options: Unpack[AuditOptions]) -> AuditReport:
    """Audit a file or folder on every component.

    Cost, readiness and the identifier scan, with the global readiness score
    and the quick wins that follow from all three.
    """
    return _audit(target, COMPONENTS, options)


def security_audit(target: str | os.PathLike[str], **options: Unpack[AuditOptions]) -> AuditReport:
    """Find personal and financial identifiers, and nothing else.

    Values arrive masked. `report.documents[i].sensitive.matches` carries each
    one with its `severity` and its `evidence` tier — `confirmed` where a
    checksum passed, down to `model` for a statistical guess.
    """
    return _audit(target, ("sensitive",), options)


def cost_audit(target: str | os.PathLike[str], **options: Unpack[AuditOptions]) -> AuditReport:
    """Estimate what these documents would cost an LLM to read.

    Per model and per architecture — the text layer, the text layer with OCR
    behind it, and every page sent as an image.
    """
    return _audit(target, ("cost",), options)


def readiness_audit(target: str | os.PathLike[str], **options: Unpack[AuditOptions]) -> AuditReport:
    """Measure how ready these documents are to extract data from.

    `report.documents[i].readiness.signals` holds the signals. A signal that could
    not be measured is reported as not applicable.
    """
    return _audit(target, ("readiness",), options)


def write_html(
    report: AuditReport,
    path: str | os.PathLike[str],
    *,
    config: Config | None = None,
) -> Path:
    """Write the report as one self-contained HTML file, and return where.

    Pass the same `config` the audit used if it was not the default one: the
    page echoes parts of it, so a report written against a different
    configuration would describe settings that did not produce it.
    """
    return _write_html(report, config or load_config(), Path(path).expanduser())


def write_json(
    report: AuditReport,
    path: str | os.PathLike[str],
    *,
    detail: Literal["summary", "full"] = "summary",
) -> Path:
    """Write the report as JSON, and return where. Same shape the CLI writes.

    `detail="summary"` leaves out the price of every document on every model and
    the page geometry the HTML draws with, keeping the folder's cost per model.
    `detail="full"` writes every field; use it for anything that reprocesses
    reports, since a summary reads back without the parts it left out.
    """
    return _write_json(report, Path(path).expanduser(), detail=detail)


def iter_audit(
    target: str | os.PathLike[str],
    *,
    components: Sequence[str] = COMPONENTS,
    **options: Unpack[AuditOptions],
) -> Iterator[DocumentReport | SkipRecord]:
    """Yield each document's report entry as it is read, and each skipped file.

    Takes the options of `full_audit`. The network guard is armed while a document
    is read and released between documents. Raises `FileNotFoundError` for a missing
    path when called.
    """
    folder = Path(target).expanduser()
    if not folder.exists():
        raise FileNotFoundError(f"no such file or folder: {folder}")
    plan = plan_audit(
        folder,
        options.get("config") or load_config(),
        components,
        ocr=options.get("ocr", False),
        reveal=options.get("reveal", False),
        select_models=options.get("models"),
        recurse=options.get("recurse", True),
        page_images=options.get("page_images", False),
        extracted_text=options.get("extracted_text", False),
        password=options.get("password", ""),
        extractor=options.get("extractor"),
        compare_extractors=tuple(options.get("compare_extractors") or ()),
        compare_engines=tuple(options.get("compare_engines") or ()),
        jobs=options.get("jobs", 1),
        sample=options.get("sample"),
        timeout=options.get("timeout"),
    )
    return iter_entries(plan, guard=options.get("offline_guard", True))


async def aiter_audit(
    target: str | os.PathLike[str],
    *,
    components: Sequence[str] = COMPONENTS,
    **options: Unpack[AuditOptions],
) -> AsyncIterator[DocumentReport | SkipRecord]:
    """`iter_audit` for asynchronous code, reading each document in a worker thread."""
    iterator = iter_audit(target, components=components, **options)
    while True:
        item = await asyncio.to_thread(next, iterator, None)
        if item is None:
            return
        yield item
