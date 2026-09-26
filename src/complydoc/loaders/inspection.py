"""Inspect what another loader produced.

    import complydoc as cd
    from langchain_community.document_loaders import PyPDFLoader

    report = cd.inspect_documents(PyPDFLoader("contract.pdf"))
    cd.write_html(report, "inspection.html")

complydoc does not replace the loader. It runs it — or takes the documents it
already returned — and reports on the output: the same identifier scan, the
same readiness signals and the same cost estimate a folder audit produces, plus
what only a loader's output has: the metadata attached to every document, and
whether the loader tried to reach the network while it ran.

Documents are duck-typed, so no framework is imported:

- LangChain `Document`: `page_content` and `metadata`
- LlamaIndex `Document`: `text` and `metadata`
- a mapping with `page_content` or `text`, and optionally `metadata`
- a plain string

A loader is anything with `load()`, `load_data()` or `lazy_load()`, or a
callable returning documents.

Loader output carries text and metadata and no page geometry. Signals that need
the page itself (text coverage, columns, tables, rotation, scan quality) are
reported as not measured.

Page numbers come from `page_number` if present, otherwise from `page` read as
zero-based, which is what LangChain's PDF loaders emit. Several documents with
the same page number — a loader returning one document per element — are
merged into that page. A loader that returns no page numbers at all produces a
document whose page count is marked unknown.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import platform
import re
import time
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path, PurePath
from typing import TYPE_CHECKING, Any

from complydoc import __version__, offline
from complydoc.audit.run import (
    COMPONENTS,
    Work,
    assemble_report,
    build_entry,
    ner_available,
    verification_hosts,
)
from complydoc.config.loader import load_config
from complydoc.config.schema import Config
from complydoc.cost.estimator import resolve_models
from complydoc.ingest import ocr as ocr_module
from complydoc.ingest.base import (
    Document,
    DocumentFormat,
    ExtractionSummary,
    IngestOptions,
    Page,
    sha256_of,
)
from complydoc.loaders.formats import SUFFIX_FORMATS
from complydoc.loaders.origin import loader_tags
from complydoc.report.models import (
    SCHEMA_VERSION,
    AuditReport,
    DocumentReport,
    Limitation,
    LoaderRun,
    MetadataFinding,
    RunMetadata,
)
from complydoc.sensitive.scanner import scan_text
from complydoc.utils.text import count

if TYPE_CHECKING:
    from complydoc.loaders.cache import LoaderCache

__all__ = [
    "ABSOLUTE_PATH",
    "SOURCE_KEYS",
    "FolderSource",
    "document_content",
    "inspect_documents",
    "load_items",
]

SOURCE_KEYS = ("source", "file_path", "filename", "file_name")
"""Metadata keys loaders use to name the file a document came from, in order."""

_FORMATS = SUFFIX_FORMATS

ABSOLUTE_PATH = re.compile(r"^(?:/[^/\s]+){2,}|^[A-Za-z]:[\\/]|^~[/\\]")

_MIN_SCANNABLE = 4
"""Metadata values with fewer alphanumeric characters than this are not scanned.

No identifier category is that short, and loaders attach a page number and a
page label to every page, which would otherwise mean running the name model
over thousands of one- and two-digit strings.
"""


def inspect_documents(
    source: Any,
    *,
    name: str | None = None,
    config: Config | None = None,
    components: Sequence[str] = COMPONENTS,
    reveal: bool = False,
    extracted_text: bool = True,
    models: Sequence[str] | None = None,
    allow_network: bool = False,
) -> AuditReport:
    """Report on the documents a loader produced.

    `source` is a loader, a callable returning documents, a list of documents,
    or a single document. A loader is run inside the network guard, and any
    connection it attempts is recorded in `report.loader.network_attempts`; a
    loader that fails because a connection was refused produces a report with
    no documents and the failure in `report.loader.error`. Any other exception
    a loader raises is not caught.

    `allow_network=True` lets the loader's connections through, for loaders
    that call a hosted service. Each lookup and connection is still recorded,
    the report states that network access was allowed, and everything
    complydoc does after loading stays behind the guard.

    `extracted_text` is on by default here, unlike `full_audit`.
    """
    inspection = inspect_run(
        source,
        name=name,
        config=config,
        components=components,
        reveal=reveal,
        extracted_text=extracted_text,
        models=models,
        allow_network=allow_network,
    )
    return finish_report(inspection)


@dataclass(slots=True)
class Inspection:
    """One loader's output, read and scanned, before the report is assembled.

    Kept separate from the report so `compare_loaders` can attach the other
    loaders' readings to the entries before scores and limitations are worked
    out from them.
    """

    settings: Config
    components: tuple[str, ...]
    entries: list[DocumentReport]
    run: RunMetadata
    loader: LoaderRun
    page_text: dict[str, dict[int, str]] = field(default_factory=dict)
    """What the loader returned, by document path and page, before masking.

    The comparison asks whether two loaders read the same words, and the report
    entries carry those words masked, where a value covered over a slightly
    different span in each reading makes two identical pages look different.
    This never reaches the report: it is held for the length of the comparison
    and dropped with the Inspection.
    """
    metadata_keys: dict[str, set[str]] = field(default_factory=dict)
    """The metadata keys the loader returned, by document path.

    A comparison over several file types compares keys only between loaders
    that read the same type, since a PDF loader's keys say nothing about a Word
    loader's.
    """


def inspect_run(
    source: Any,
    *,
    name: str | None,
    config: Config | None,
    components: Sequence[str],
    reveal: bool,
    extracted_text: bool,
    models: Sequence[str] | None,
    allow_network: bool,
    verify: bool = False,
    verify_scope: str = "flagged",
) -> Inspection:
    """Run the loader and build a report entry for each document it returned.

    With `verify`, each page is read again by the vision model registered in
    this process, rendered from the file the loader's metadata names.
    """
    from complydoc.report.models import ReadingCost
    from complydoc.verification.vision import model_name, registered_vision_model

    if isinstance(source, (str, bytes, os.PathLike)):
        raise TypeError(
            "inspect_documents takes documents or a loader; use full_audit to audit files on disk"
        )

    settings = config or load_config()
    started = time.monotonic()
    started_at = dt.datetime.now().astimezone()

    with offline.guarded():
        items, loader_run = _run_loader(source, name, allow_network)
        documents, findings, exposures = _documents_from(
            items, loader_run.name, settings, components, reveal
        )

        root = _common_root([document.path for document in documents])
        vision = registered_vision_model() if verify else None
        work = Work(
            config=settings,
            # The loader is the reader whose text each page keeps.
            options=IngestOptions(extractor=loader_run.name),
            target=root or Path(loader_run.name),
            requested=tuple(components),
            reveal=reveal,
            previews=False,
            page_images=False,
            extracted_text=extracted_text,
            models=(
                tuple(resolve_models(settings.pricing, list(models) if models else None))
                if "cost" in components
                else None
            ),
            today=dt.date.today(),
            verifying=vision is not None,
            verify_scope=verify_scope,
        )

        entries: list[DocumentReport] = []
        page_text: dict[str, dict[int, str]] = {}
        for document in documents:
            relative = _relative_name(document.path, root)
            entry = build_entry(document, work, 0.0, relative)
            entry.metadata_findings = findings.get(str(document.path), [])
            entry.path_exposures = exposures.get(str(document.path), [])
            if allow_network:
                # A loader let onto the network may be a hosted parser with a
                # bill of its own, which nothing here can see.
                for page in entry.extracted_text:
                    page.costs[loader_run.name] = ReadingCost(None, "unpriced")
            entries.append(entry)
            page_text[str(document.path)] = {
                page.number: page.text or page.ocr_text for page in document.pages
            }

        run = RunMetadata(
            tool_version=__version__,
            schema_version=SCHEMA_VERSION,
            started_at=started_at.isoformat(timespec="seconds"),
            finished_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
            duration_seconds=round(time.monotonic() - started, 3),
            target=str(root) if root else loader_run.name,
            components_run=list(components),
            config_dir=settings.source_dir,
            config_digest=settings.digest,
            offline_guard=offline.guard_status(),
            reveal_used=reveal,
            page_images_used=False,
            extracted_text_used=extracted_text,
            ocr_compare_used=False,
            ocr_requested=False,
            ocr_available=ocr_module.available(),
            ner_available=ner_available(settings) if "sensitive" in components else False,
            python_version=platform.python_version(),
            monthly_volume=None,
            extractor=loader_run.name,
            content_sent_to=verification_hosts(entries),
            verify_model=f"vision:{model_name(vision)}" if vision is not None else None,
            verify_scope=verify_scope if vision is not None else None,
        )

    keys: dict[str, set[str]] = {}
    for item in items:
        _text, metadata = document_content(item)
        path = next(
            (str(metadata[k]) for k in SOURCE_KEYS if isinstance(metadata.get(k), str | PurePath)),
            loader_run.name,
        )
        keys.setdefault(str(Path(path)), set()).update(metadata)
    return Inspection(settings, tuple(components), entries, run, loader_run, page_text, keys)


def finish_report(inspection: Inspection) -> AuditReport:
    """Scores, limitations and quick wins, from entries that are complete."""
    with offline.guarded():
        report = assemble_report(
            inspection.settings,
            inspection.components,
            inspection.entries,
            [],
            inspection.run,
        )
    report.loader = inspection.loader
    report.limitations[:0] = _loader_limitations(inspection.loader, inspection.entries)
    return report


def loader_name(source: Any) -> str:
    """The name a loader is reported under when the caller gives none."""
    return _name_of(source, _loading_call(source))


def _run_loader(source: Any, name: str | None, allow_network: bool) -> tuple[list[Any], LoaderRun]:
    """Call the loader, or take the documents as given, recording what happened."""
    call = _loading_call(source)
    loader_name = name or _name_of(source, call)
    error: str | None = None
    items: list[Any] = []

    started = time.perf_counter()
    with offline.permitted() if allow_network else offline.guarded() as attempts:
        try:
            items = _load_items(source, call)
        except offline.NetworkAccessError as exc:
            error = f"stopped when a network connection was refused: {exc}"
    seconds = round(time.perf_counter() - started, 3) if call is not None else None

    keys: set[str] = set()
    for item in items:
        keys.update(document_content(item)[1])

    return items, LoaderRun(
        name=loader_name,
        documents_returned=len(items),
        seconds=seconds,
        network_attempts=list(attempts),
        error=error,
        metadata_keys=sorted(keys),
        network_allowed=allow_network,
        failures=dict(source.failures) if isinstance(source, FolderSource) else {},
        cached_files=source.cached_files if isinstance(source, FolderSource) else 0,
        tags=loader_tags(source),
        skipped=list(source.skipped) if isinstance(source, FolderSource) else [],
        formats=list(source.formats)
        if isinstance(source, FolderSource) and source.formats is not None
        else None,
    )


class FolderSource:
    """A loader factory run once per file.

    `factory` is called with each file path and returns a loader or documents. A file
    that raises is recorded in `failures` and loading continues with the next. With a
    `cache`, output is stored per file under `name`, and a cached file is not parsed.
    With `formats`, a list of extensions, files of other types are not given to the
    factory and are listed in `skipped`. `seconds` is each file's loading time.
    """

    def __init__(
        self,
        factory: Callable[[str], Any],
        files: Iterable[Path],
        *,
        name: str = "",
        cache: LoaderCache | None = None,
        tags: Iterable[str] = (),
        formats: Iterable[str] | None = None,
    ) -> None:
        self.factory = factory
        self.name = name
        self.cache = cache
        self.tags = list(tags)
        self.formats = tuple(formats) if formats is not None else None
        given = list(files)
        self.files = [p for p in given if self.formats is None or p.suffix.lower() in self.formats]
        self.skipped = [str(p) for p in given if p not in self.files]
        self.failures: dict[str, str] = {}
        self.seconds: dict[str, float] = {}
        self.cached_files = 0

    def load(self) -> list[Any]:
        items: list[Any] = []
        for path in self.files:
            started = time.perf_counter()
            try:
                items.extend(self._load_file(path))
            finally:
                self.seconds[str(path)] = round(time.perf_counter() - started, 3)
        return items

    def _load_file(self, path: Path) -> list[Any]:
        if self.cache is not None:
            cached = self.cache.get(self.name, path)
            if cached is not None:
                self.cached_files += 1
                return list(cached)
        try:
            source = self.factory(str(path))
            loaded = _load_items(source, _loading_call(source))
        # The loader is caller code. Whatever it raises is recorded against the file.
        except Exception as exc:
            self.failures[str(path)] = f"{type(exc).__name__}: {exc}"
            return []
        if self.cache is not None:
            self.cache.put(self.name, path, [document_content(item) for item in loaded])
        return loaded


def load_items(source: Any) -> list[Any]:
    """The documents a loader, a callable, a list or a single document provides."""
    return _load_items(source, _loading_call(source))


def _load_items(source: Any, call: Callable[[], Iterable[Any]] | None) -> list[Any]:
    if call is not None:
        return list(call())
    if _is_document_like(source):
        return [source]
    return list(source)


def _loading_call(source: Any) -> Callable[[], Iterable[Any]] | None:
    if _is_document_like(source) or isinstance(source, (list, tuple)):
        return None
    for attribute in ("load", "load_data", "lazy_load"):
        method = getattr(source, attribute, None)
        if callable(method):
            return method  # type: ignore[no-any-return]
    if callable(source):
        return source  # type: ignore[no-any-return]
    return None


def _name_of(source: Any, call: Callable[[], Iterable[Any]] | None) -> str:
    if call is None:
        return "documents"
    if call is source:
        return getattr(source, "__name__", type(source).__name__)
    return type(source).__name__


def _is_document_like(item: Any) -> bool:
    if isinstance(item, str):
        return True
    if isinstance(item, Mapping):
        return "page_content" in item or "text" in item
    return hasattr(item, "page_content") or (hasattr(item, "text") and hasattr(item, "metadata"))


def document_content(item: Any) -> tuple[str, dict[str, Any]]:
    """The text and metadata of one document, whatever framework produced it."""
    if isinstance(item, str):
        return item, {}
    if isinstance(item, Mapping):
        text = item.get("page_content", item.get("text"))
        metadata = item.get("metadata") or {}
    elif hasattr(item, "page_content"):
        text = item.page_content
        metadata = getattr(item, "metadata", None) or {}
    elif hasattr(item, "text") and hasattr(item, "metadata"):
        text = item.text
        metadata = item.metadata or {}
    else:
        raise TypeError(
            f"cannot read a document from {type(item).__name__}: expected "
            f"page_content or text, and optionally metadata"
        )
    if not isinstance(text, str):
        raise TypeError(f"document text must be a string, not {type(text).__name__}")
    return text, dict(metadata)


def _page_of(metadata: Mapping[str, Any]) -> int | None:
    for key, offset in (("page_number", 0), ("page", 1)):
        value = metadata.get(key)
        if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
            return max(1, value + offset)
    return None


def _documents_from(
    items: list[Any],
    loader_name: str,
    settings: Config,
    components: Sequence[str],
    reveal: bool,
) -> tuple[list[Document], dict[str, list[MetadataFinding]], dict[str, list[str]]]:
    """Group loader output into documents, and scan the metadata once per value."""
    groups: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for item in items:
        text, metadata = document_content(item)
        key = next(
            (str(metadata[k]) for k in SOURCE_KEYS if isinstance(metadata.get(k), str | PurePath)),
            loader_name,
        )
        groups.setdefault(key, []).append((text, metadata))

    documents: list[Document] = []
    findings: dict[str, list[MetadataFinding]] = {}
    exposures: dict[str, list[str]] = {}
    scan_metadata = "sensitive" in components

    for key, members in groups.items():
        path = Path(key)
        pages: dict[int, list[str]] = {}
        numbered = False
        for text, metadata in members:
            number = _page_of(metadata)
            if number is None:
                number = max(pages, default=0) + 1
            else:
                numbered = True
            pages.setdefault(number, []).append(text)

        document = Document(
            path=path,
            sha256=_digest(path, members),
            format=_FORMATS.get(path.suffix.lower(), DocumentFormat.OTHER),
        )
        document.page_count_known = numbered
        for number in sorted(pages):
            page = Page(number=number, width_pt=0.0, height_pt=0.0)
            page.text = "\n\n".join(pages[number])
            page.text_source = "loader"
            page.extractions.append(
                ExtractionSummary(
                    extractor=loader_name,
                    characters=len(page.text.strip()),
                    coverage_pct=None,
                    seconds=0.0,
                    granularity="none",
                    tables_found=None,
                )
            )
            document.pages.append(page)
        documents.append(document)

        found, paths = _scan_metadata(members, settings, reveal) if scan_metadata else ([], [])
        findings[str(path)] = found
        exposures[str(path)] = paths if scan_metadata else _path_keys(members)

    return documents, findings, exposures


def _scan_metadata(
    members: list[tuple[str, dict[str, Any]]], settings: Config, reveal: bool
) -> tuple[list[MetadataFinding], list[str]]:
    """Identifiers in metadata values, each distinct key and value reported once.

    Loaders repeat the same metadata on every page, so a finding is attached to
    the first page it appeared on.
    """
    seen: set[tuple[str, str]] = set()
    found: list[MetadataFinding] = []
    for _text, metadata in members:
        page = _page_of(metadata)
        for key, value in metadata.items():
            rendered = _as_text(value)
            if (key, rendered) in seen:
                continue
            seen.add((key, rendered))
            if sum(c.isalnum() for c in rendered) < _MIN_SCANNABLE:
                continue
            matches, _unavailable = scan_text(rendered, settings.sensitive, reveal)
            found.extend(
                MetadataFinding(
                    key=key,
                    category=match.category,
                    label=match.label,
                    severity=match.severity,
                    evidence=match.evidence,
                    masked=match.masked,
                    revealed=match.revealed,
                    page=page,
                )
                for match in matches
            )
    return found, _path_keys(members)


def _path_keys(members: list[tuple[str, dict[str, Any]]]) -> list[str]:
    keys = {
        key
        for _text, metadata in members
        for key, value in metadata.items()
        if isinstance(value, str) and ABSOLUTE_PATH.match(value)
    }
    return sorted(keys)


def _as_text(value: Any) -> str:
    if value is None or isinstance(value, bool):
        return ""
    if isinstance(value, str | int | float):
        return str(value)
    try:
        return json.dumps(value, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


def _digest(path: Path, members: list[tuple[str, dict[str, Any]]]) -> str:
    """The file's hash where the file is readable here, the text's otherwise."""
    try:
        if path.is_file():
            return sha256_of(path)
    except OSError:
        pass
    return hashlib.sha256("\n".join(text for text, _ in members).encode("utf-8")).hexdigest()


def _common_root(paths: list[Path]) -> Path | None:
    absolute = [p for p in paths if p.is_absolute()]
    if not absolute or len(absolute) != len(paths):
        return None
    if len(absolute) == 1:
        return absolute[0].parent
    return Path(os.path.commonpath([str(p.parent) for p in absolute]))


def _relative_name(path: Path, root: Path | None) -> str:
    if root is None:
        return str(path)
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def _loader_limitations(loader: LoaderRun, entries: list[DocumentReport]) -> list[Limitation]:
    names = [entry.relative_path for entry in entries]
    limitations: list[Limitation] = []

    if loader.error:
        limitations.append(
            Limitation(
                area="Loader",
                statement=f"{loader.name} did not finish: {loader.error}.",
                severity="important",
            )
        )
    if loader.cached_files:
        limitations.append(
            Limitation(
                area="Loader",
                statement=(
                    f"{loader.name} output for {count(loader.cached_files, 'file')} came from "
                    f"the cache; load time and network attempts cover only the files parsed."
                ),
                severity="info",
            )
        )
    if loader.failures:
        limitations.append(
            Limitation(
                area="Loader",
                statement=f"{loader.name} failed on {count(len(loader.failures), 'file')}.",
                affected=[f"{path}: {reason}" for path, reason in loader.failures.items()],
                severity="important",
            )
        )
    if loader.network_allowed:
        made = len(loader.network_attempts)
        limitations.append(
            Limitation(
                area="Loader",
                statement=(
                    f"{loader.name} was allowed network access (allow_network=True) and "
                    + (
                        f"made {made} network connection(s). Document content may have "
                        f"left this machine."
                        if made
                        else "made no connections."
                    )
                ),
                affected=list(loader.network_attempts),
                severity="important" if made else "info",
            )
        )
    elif loader.network_attempts:
        limitations.append(
            Limitation(
                area="Loader",
                statement=(
                    f"{loader.name} attempted {len(loader.network_attempts)} network "
                    f"connection(s) while loading, and complydoc refused them."
                ),
                affected=list(loader.network_attempts),
                severity="important",
            )
        )

    metadata_hits = [
        e.relative_path for e in entries if any(f.significant for f in e.metadata_findings)
    ]
    if metadata_hits:
        total = sum(1 for e in entries for f in e.metadata_findings if f.significant)
        limitations.append(
            Limitation(
                area="Metadata",
                statement=(
                    f"{total} identifier(s) were found in metadata {loader.name} returned. "
                    f"Metadata is usually stored beside each chunk."
                ),
                affected=metadata_hits,
                severity="important",
            )
        )

    path_keys = sorted({key for e in entries for key in e.path_exposures})
    if path_keys:
        limitations.append(
            Limitation(
                area="Metadata",
                statement=(
                    f"Metadata key(s) {', '.join(path_keys)} hold absolute file paths, which "
                    f"include the account name and directory layout they came from."
                ),
                affected=[e.relative_path for e in entries if e.path_exposures],
                severity="important",
            )
        )

    if entries:
        limitations.append(
            Limitation(
                area="Loader",
                statement=(
                    f"Text came from {loader.name}. Signals that need "
                    f"the page itself — text coverage, columns, tables, rotation and scan "
                    f"quality — are reported as not measured, and vision cost is not "
                    f"estimated."
                ),
                affected=names,
                severity="info",
            )
        )
    return limitations
