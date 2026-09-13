"""Several loaders on the same input, side by side.

    import complydoc as cd
    from langchain_community.document_loaders import PDFPlumberLoader, PyPDFLoader

    report = cd.compare_loaders(
        {"pypdf": PyPDFLoader("contract.pdf"), "pdfplumber": PDFPlumberLoader("contract.pdf")}
    )
    cd.write_html(report, "loaders.html")

Each loader is inspected exactly as `inspect_documents` would inspect it. The
first one given is the baseline: the report's findings, scores and cost are
built from its output, and every other loader is measured against it.

- Text: how closely each loader's text matches the baseline's, page by page,
  with the words that differ marked on the Documents page.
- Identifiers: which ones turned up in one loader's output and not another's,
  in text or in metadata. A loader's text is the input to everything after it,
  so an identifier one loader drops is one no later scan will find.
- Metadata keys, documents and network connections that differ.

Documents are matched across loaders by the file their metadata names. Pages
are matched by page number when both loaders return page numbers; otherwise
the whole document's text is compared.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import time
from collections import Counter
from collections.abc import Mapping, Sequence
from typing import Any

from complydoc.audit import COMPONENTS
from complydoc.config.loader import load_config
from complydoc.config.schema import Config
from complydoc.loaders import Inspection, finish_report, inspect_run, loader_name
from complydoc.quickwins import quick_wins
from complydoc.report.models import (
    AuditReport,
    DocumentReport,
    ExtractorReading,
    IdentifierDifference,
    Limitation,
    LoaderComparison,
    LoaderSummary,
)
from complydoc.sensitive.base import SEVERITY_WEIGHT
from complydoc.text import MAX_WORDS, count, reading_similarity, same_words, words

__all__ = ["compare_loaders"]


def compare_loaders(
    loaders: Mapping[str, Any] | Sequence[Any],
    *,
    config: Config | None = None,
    components: Sequence[str] = COMPONENTS,
    reveal: bool = False,
    extracted_text: bool = True,
    models: Sequence[str] | None = None,
    allow_network: bool = False,
) -> AuditReport:
    """Run several loaders on the same input and report where their output differs.

    `loaders` maps a name to a loader, or is a sequence of loaders, each named
    after its class. Anything `inspect_documents` accepts as a source is
    accepted as a loader, including documents already loaded. The first is the
    baseline the report's findings are built from.

    The comparison is in `report.loader_comparison`. Each document's
    `extractions` lists every loader's reading of it, first the baseline's, and
    with `extracted_text` on, each page carries the other loaders' text in
    `readings`.

    `allow_network` applies to every loader. Each one's connections are
    recorded in its row of `report.loader_comparison.loaders`.
    """
    named = _named(loaders)
    if len(named) < 2:
        raise ValueError(
            "compare_loaders needs at least two loaders; use inspect_documents for one"
        )

    settings = config or load_config()
    started = time.monotonic()
    inspections = [
        inspect_run(
            source,
            name=name,
            config=settings,
            components=components,
            reveal=reveal,
            # The comparison is made from the text, so it is always kept while
            # comparing and dropped afterwards if the caller did not ask for it.
            extracted_text=True,
            models=models,
            allow_network=allow_network,
        )
        for name, source in named
    ]
    baseline, others = inspections[0], inspections[1:]
    by_path = [{str(entry.path): entry for entry in i.entries} for i in inspections]
    characters = {
        i.loader.name: sum(p.characters for e in i.entries for p in e.extracted_text)
        for i in inspections
    }

    for entry in baseline.entries:
        entry.extractions = _readings(entry, baseline, list(zip(others, by_path[1:], strict=True)))
    differences = _identifier_differences(inspections, by_path, reveal)

    if not extracted_text:
        for entry in baseline.entries:
            entry.extracted_text = []
    baseline.run = dataclasses.replace(
        baseline.run,
        finished_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        duration_seconds=round(time.monotonic() - started, 3),
        extracted_text_used=extracted_text,
        compare_extractors=[i.loader.name for i in others],
    )

    other_reports = {i.loader.name: finish_report(i) for i in others}
    report = finish_report(baseline)
    reports = {baseline.loader.name: report, **other_reports}

    comparison = LoaderComparison(
        baseline=baseline.loader.name,
        loaders=[
            _summary(reports[i.loader.name], i, characters[i.loader.name]) for i in inspections
        ],
        identifier_differences=differences,
        metadata_keys=_uneven_keys(inspections),
        documents=_uneven_documents(inspections, by_path),
    )
    report.loader_comparison = comparison
    report.limitations[:0] = _comparison_limitations(comparison, report, other_reports)
    report.quick_wins = quick_wins(report)
    return report


def _named(loaders: Mapping[str, Any] | Sequence[Any]) -> list[tuple[str, Any]]:
    if isinstance(loaders, Mapping):
        return [(str(name), source) for name, source in loaders.items()]
    if isinstance(loaders, (str, bytes)) or not isinstance(loaders, Sequence):
        raise TypeError("compare_loaders takes a mapping of names to loaders, or a list of loaders")
    seen: Counter[str] = Counter()
    named: list[tuple[str, Any]] = []
    for source in loaders:
        base = loader_name(source)
        seen[base] += 1
        named.append((base if seen[base] == 1 else f"{base} ({seen[base]})", source))
    return named


def _pages(entry: DocumentReport) -> dict[int, str]:
    return {page.number: page.text for page in entry.extracted_text}


def _whole(pages: dict[int, str]) -> str:
    return "\n\n".join(pages[number] for number in sorted(pages))


def _readings(
    entry: DocumentReport,
    baseline: Inspection,
    others: list[tuple[Inspection, dict[str, DocumentReport]]],
) -> list[ExtractorReading]:
    """Every loader's reading of one document, the baseline's first."""
    own = _pages(entry)
    readings = [_reading(baseline.loader.name, entry, 1.0, False)]
    for inspection, entries in others:
        other = entries.get(str(entry.path))
        if other is None:
            continue
        name = inspection.loader.name
        theirs = _pages(other)
        if entry.page_count_known and other.page_count_known:
            similarity, reordered = _paged_similarity(own, theirs)
            for page in entry.extracted_text:
                page.readings[name] = theirs.get(page.number, "")
        else:
            # Without page numbers on both sides there is nothing to line pages
            # up by, so the document is compared as one run of text.
            left, right = words(_whole(own)), words(_whole(theirs))
            similarity = reading_similarity(left[:MAX_WORDS], right[:MAX_WORDS])
            reordered = similarity < 1.0 and same_words(left, right)
            if len(entry.extracted_text) == 1:
                entry.extracted_text[0].readings[name] = _whole(theirs)
        readings.append(_reading(name, other, similarity, reordered))
    return readings


def _paged_similarity(left: dict[int, str], right: dict[int, str]) -> tuple[float, bool]:
    """The worst page's similarity, and whether every page that differed was reordered.

    A page only one loader returned counts as a page the other read nothing off.
    """
    worst = 1.0
    differed = False
    reordered = True
    for number in sorted(set(left) | set(right)):
        a, b = words(left.get(number, "")), words(right.get(number, ""))
        similarity = reading_similarity(a[:MAX_WORDS], b[:MAX_WORDS])
        if similarity < 1.0:
            differed = True
            reordered = reordered and same_words(a, b)
        worst = min(worst, similarity)
    return round(worst, 4), differed and reordered


def _reading(
    name: str, entry: DocumentReport, similarity: float, reordered: bool
) -> ExtractorReading:
    return ExtractorReading(
        extractor=name,
        characters=sum(page.characters for page in entry.extracted_text),
        mean_coverage_pct=None,
        seconds=0.0,
        granularity="none",
        reads_tables=False,
        similarity=similarity,
        reordered=reordered,
    )


def _identifier_differences(
    inspections: list[Inspection],
    by_path: list[dict[str, DocumentReport]],
    reveal: bool,
) -> list[IdentifierDifference]:
    """Identifiers some loaders returned for a document and others did not.

    Only loaders that returned the document are compared on it; a document a
    loader did not return at all is reported separately.
    """
    paths = list(dict.fromkeys(path for entries in by_path for path in entries))
    differences: list[IdentifierDifference] = []

    for path in paths:
        present = [
            (inspection.loader.name, entries[path])
            for inspection, entries in zip(inspections, by_path, strict=True)
            if path in entries
        ]
        if len(present) < 2:
            continue

        found: dict[tuple[str, str, str], list[str]] = {}
        example: dict[tuple[str, str, str], Any] = {}
        keys: dict[tuple[str, str, str], set[str]] = {}
        for name, entry in present:
            here: set[tuple[str, str, str]] = set()
            for match in entry.sensitive.matches if entry.sensitive else []:
                identity = ("text", match.category, match.masked)
                here.add(identity)
                example.setdefault(identity, match)
            for finding in entry.metadata_findings:
                identity = ("metadata", finding.category, finding.masked)
                here.add(identity)
                example.setdefault(identity, finding)
                keys.setdefault(identity, set()).add(finding.key)
            for identity in here:
                found.setdefault(identity, []).append(name)

        names = [name for name, _entry in present]
        document = present[0][1].relative_path
        for identity, found_by in found.items():
            if len(found_by) == len(names):
                continue
            item = example[identity]
            differences.append(
                IdentifierDifference(
                    document=document,
                    category=item.category,
                    label=item.label,
                    severity=item.severity,
                    evidence=item.evidence,
                    value=item.revealed if reveal and item.revealed else item.masked,
                    location=identity[0],
                    keys=sorted(keys.get(identity, set())),
                    found_by=found_by,
                    missed_by=[name for name in names if name not in found_by],
                )
            )

    differences.sort(key=lambda d: (-SEVERITY_WEIGHT.get(d.severity, 0), d.document, d.label))
    return differences


def _uneven_keys(inspections: list[Inspection]) -> dict[str, list[str]]:
    """Metadata keys some loaders returned and others did not, ignoring case.

    PyPDF writes `author` where PDFPlumber writes `Author`; listing both as
    missing from the other would bury the keys that actually differ. A key
    spelled differently is shown under every spelling, joined by a slash.
    """
    returned = {i.loader.name: {k.casefold() for k in i.loader.metadata_keys} for i in inspections}
    spellings: dict[str, list[str]] = {}
    for inspection in inspections:
        for key in inspection.loader.metadata_keys:
            seen = spellings.setdefault(key.casefold(), [])
            if key not in seen:
                seen.append(key)
    return {
        " / ".join(spellings[folded]): [name for name, keys in returned.items() if folded in keys]
        for folded in sorted(spellings)
        if not all(folded in keys for keys in returned.values())
    }


def _uneven_documents(
    inspections: list[Inspection], by_path: list[dict[str, DocumentReport]]
) -> dict[str, list[str]]:
    paths = list(dict.fromkeys(path for entries in by_path for path in entries))
    uneven: dict[str, list[str]] = {}
    for path in paths:
        holders = [
            (inspection.loader.name, entries[path])
            for inspection, entries in zip(inspections, by_path, strict=True)
            if path in entries
        ]
        if len(holders) < len(inspections):
            uneven[holders[0][1].relative_path] = [name for name, _entry in holders]
    return uneven


def _summary(report: AuditReport, inspection: Inspection, characters: int) -> LoaderSummary:
    entries = report.documents
    loader = inspection.loader
    return LoaderSummary(
        name=loader.name,
        documents=len(entries),
        pages=sum(entry.page_count for entry in entries),
        characters=characters,
        seconds=loader.seconds,
        network_allowed=loader.network_allowed,
        network_attempts=list(loader.network_attempts),
        error=loader.error,
        metadata_keys=list(loader.metadata_keys),
        identifiers_in_text=sum(len(e.sensitive.matches) for e in entries if e.sensitive),
        identifiers_in_metadata=sum(len(e.metadata_findings) for e in entries),
        documents_with_paths=sum(1 for e in entries if e.path_exposures),
        readiness_score=report.aggregate.mean_readiness_score if report.aggregate else None,
        global_score=report.overall.score if report.overall else None,
        text_path_usd=report.aggregate.total_text_path_usd if report.aggregate else None,
    )


def _comparison_limitations(
    comparison: LoaderComparison,
    report: AuditReport,
    other_reports: dict[str, AuditReport],
) -> list[Limitation]:
    others = ", ".join(other_reports)
    limitations = [
        Limitation(
            area="Loaders",
            statement=(
                f"Findings, scores and cost are built from {comparison.baseline}, the first "
                f"loader given. {others} ran on the same input and are compared against it."
            ),
            severity="info",
        )
    ]

    significant = [d for d in comparison.identifier_differences if d.significant]
    if significant:
        limitations.append(
            Limitation(
                area="Loaders",
                statement=(
                    f"{count(len(significant), 'identifier')} turned up in the output of some "
                    f"loaders and not others. Text a loader drops cannot be found by a scan "
                    f"that runs on its output."
                ),
                affected=sorted({d.document for d in significant}),
                severity="important",
            )
        )

    if comparison.documents:
        limitations.append(
            Limitation(
                area="Loaders",
                statement="The loaders did not all return the same documents.",
                affected=sorted(comparison.documents),
                severity="important",
            )
        )

    # Network attempts, failures and metadata findings from the other loaders
    # would otherwise appear nowhere; the baseline's are already in the report.
    stated = {limitation.statement for limitation in report.limitations}
    for other in other_reports.values():
        for limitation in other.limitations:
            if (
                limitation.severity == "important"
                and limitation.area in {"Loader", "Metadata"}
                and limitation.statement not in stated
            ):
                stated.add(limitation.statement)
                limitations.append(limitation)
    return limitations
