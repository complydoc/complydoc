"""Several loaders on the same input, side by side.

    import complydoc as cd
    from langchain_pymupdf4llm import PyMuPDF4LLMLoader

    report = cd.compare_loaders(
        {"pymupdf4llm": PyMuPDF4LLMLoader, "docling": cd.parsers.docling()},
        paths="contract.pdf",
    )
    cd.write_html(report, "loaders.html")

Each loader is inspected exactly as `inspect_documents` would inspect it. The
first one given is the baseline: the report's findings, scores and cost are
built from its output, and every other loader is measured against it. A
document the first loader did not return, because it failed on the file or is
not meant for its type, is measured against the next loader that returned it.

Over a folder of several file types, each loader is given only the types it is
meant for (see `complydoc.loaders.formats`), and the comparison is repeated for
each type in `loader_comparison.formats`, with its own recommendation.

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

import copy
import dataclasses
import datetime as dt
import os
import time
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any

from complydoc.audit.discovery import discover
from complydoc.audit.run import COMPONENTS, reading_tokens, tokenizers_of, vision_setup
from complydoc.config.loader import load_config
from complydoc.config.schema import Config, ParserPricing, TokenizerSpec
from complydoc.cost.estimator import resolve_models
from complydoc.extraction.facts import FUZZY_THRESHOLD, Fact, as_facts, evaluate_facts
from complydoc.loaders.cache import LoaderCache
from complydoc.loaders.formats import (
    FORMAT_LABELS,
    SUFFIX_FORMATS,
    extensions,
    format_of,
    loader_formats,
)
from complydoc.loaders.inspection import (
    FolderSource,
    Inspection,
    finish_report,
    inspect_run,
    loader_name,
)
from complydoc.loaders.origin import loader_tags
from complydoc.loaders.parsers import LoaderSpec
from complydoc.loaders.verdict import (
    LoaderVerdict,
    recommend,
    recommend_across_formats,
    recommend_rows,
)
from complydoc.report.models import (
    AuditReport,
    DocumentReport,
    ExtractorReading,
    FactCheck,
    FormatComparison,
    FormatLoaderRow,
    IdentifierDifference,
    Limitation,
    LoaderComparison,
    LoaderSummary,
    ReadingCost,
)
from complydoc.report.quickwins import quick_wins
from complydoc.sensitive.base import SEVERITY_WEIGHT
from complydoc.utils.text import MAX_WORDS, count, reading_similarity, same_words, words
from complydoc.verification.vision import VisionModel, register_vision_model

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
    paths: str | os.PathLike[str] | Sequence[str | os.PathLike[str]] | None = None,
    facts: Iterable[Fact | str] | None = None,
    fact_threshold: float = FUZZY_THRESHOLD,
    cache_dir: str | os.PathLike[str] | None = None,
    verify_with: str | VisionModel | None = None,
    verify_scope: str = "flagged",
    formats: Mapping[str, Iterable[str]] | None = None,
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

    With `paths`, a folder, a file or a list of files, each loader is a callable
    taking a file path, such as a loader class or a `complydoc.loaders.parsers` preset, and
    runs once per file. Files a loader raises on are recorded in its row.

    `formats` maps a loader's name to the file types it is meant for, as
    extensions (`.pdf`) or format names (`docx`), and it is given only those
    files. Parser presets and well-known loader classes, such as `PyPDFLoader`,
    already know theirs; any other loader is given every file.

    `cache_dir` stores each loader's output per file when `paths` is given, so a later
    run does not parse unchanged files again; see `complydoc.loaders.cache`.

    `facts` are passages the documents are expected to contain. Each is checked
    against every loader's text; see `complydoc.extraction.facts`.

    `verify_with` reads the baseline's pages again with a vision model of the
    caller's, as `full_audit` does, rendered from the files the loaders read.
    The vision reading joins each page's `readings`, so it can be put beside any
    loader's, with what each one cost.
    """
    named = _named(loaders)
    if len(named) < 2:
        raise ValueError(
            "compare_loaders needs at least two loaders; use inspect_documents for one"
        )

    settings = config or load_config()
    files = _files(paths) if paths is not None else None
    if cache_dir is not None and files is None:
        raise TypeError("cache_dir caches output per file, so it needs paths=")
    if formats is not None:
        if files is None:
            raise TypeError("formats chooses the files each loader is given, so it needs paths=")
        unknown = sorted(set(formats) - {name for name, _value in named})
        if unknown:
            raise ValueError(f"formats names loaders that are not compared: {', '.join(unknown)}")
    cache = LoaderCache(cache_dir) if cache_dir is not None else None
    sources = [
        _source(name, value, files, cache, _loader_extensions(name, value, formats))
        for name, value in named
    ]
    networks = [_network(name, value, allow_network) for name, value in named]
    fact_list = as_facts(facts or ())
    specs = {name: value for name, value in named if isinstance(value, LoaderSpec)}
    started = time.monotonic()
    vision_setup(verify_with, verify_scope)
    try:
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
                allow_network=network,
                # The baseline's pages only: each is read once, and every loader's
                # reading of it can be set beside that one.
                verify=verify_with is not None and index == 0,
                verify_scope=verify_scope,
            )
            for index, ((name, _value), source, network) in enumerate(
                zip(named, sources, networks, strict=True)
            )
        ]
    finally:
        if verify_with is not None:
            register_vision_model(None)
    baseline, others = inspections[0], inspections[1:]
    by_path = [{str(entry.path): entry for entry in i.entries} for i in inspections]
    characters = {
        i.loader.name: sum(p.characters for e in i.entries for p in e.extracted_text)
        for i in inspections
    }
    seconds = [source.seconds if isinstance(source, FolderSource) else None for source in sources]

    owners = _take_unreturned_documents(baseline, inspections, by_path, files)
    for entry in baseline.entries:
        owner = owners[str(entry.path)]
        entry.extractions = _readings(
            entry,
            inspections[owner],
            [
                (inspection, entries, seconds[index])
                for index, (inspection, entries) in enumerate(
                    zip(inspections, by_path, strict=True)
                )
                if index != owner
            ],
            seconds[owner],
        )
    _price_readings(
        baseline.entries,
        {
            name: _loader_cost(specs.get(name), network, settings)
            for (name, _value), network in zip(named, networks, strict=True)
        },
        tokenizers_of(resolve_models(settings.pricing, models) if "cost" in components else None),
    )
    differences = _identifier_differences(inspections, by_path, reveal)
    # Each loader's own documents: the baseline's entries now hold borrowed ones too.
    fact_checks = [
        _for_loaders_meant_for(check, inspections)
        for check in evaluate_facts(
            {
                i.loader.name: list(entries.values())
                for i, entries in zip(inspections, by_path, strict=True)
            },
            fact_list,
            fact_threshold,
        )
    ]

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
            _summary(
                reports[i.loader.name],
                i,
                characters[i.loader.name],
                fact_checks if fact_list else None,
                _parser_price(specs.get(i.loader.name), settings),
                set(entries),
            )
            for i, entries in zip(inspections, by_path, strict=True)
        ],
        identifier_differences=differences,
        metadata_keys=_uneven_keys(inspections),
        documents=_uneven_documents(inspections, by_path),
        facts=fact_checks,
        baselines={
            entry.relative_path: inspections[owners[str(entry.path)]].loader.name
            for entry in report.documents
            if owners.get(str(entry.path), 0) != 0
        },
    )
    by_format = _format_comparisons(
        inspections, by_path, report.documents, files, seconds, fact_checks, bool(fact_list)
    )
    verdict = recommend_across_formats(recommend(comparison, report.documents), by_format)
    comparison = dataclasses.replace(
        comparison,
        recommended=verdict.recommended,
        verdict=verdict.reason,
        ranked=verdict.ranked,
        formats=by_format,
    )
    report.loader_comparison = comparison
    report.limitations[:0] = [
        *_comparison_limitations(comparison, report, other_reports),
        *_price_limitations(specs, settings),
    ]
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
        base = source.name if isinstance(source, LoaderSpec) else loader_name(source)
        seen[base] += 1
        named.append((base if seen[base] == 1 else f"{base} ({seen[base]})", source))
    return named


def _files(paths: str | os.PathLike[str] | Sequence[str | os.PathLike[str]]) -> list[Path]:
    if isinstance(paths, (str, os.PathLike)):
        root = Path(paths).expanduser()
        if not root.exists():
            raise FileNotFoundError(f"no such file or folder: {root}")
        files, _skipped = discover(root)
    else:
        files = [Path(path).expanduser() for path in paths]
    if not files:
        raise ValueError("paths contains no documents to load")
    return files


def _loader_extensions(
    name: str, value: Any, formats: Mapping[str, Iterable[str]] | None
) -> tuple[str, ...] | None:
    """The extensions a loader is given: the caller's, else what the loader is known for."""
    if formats is not None and name in formats:
        chosen = extensions(formats[name])
        if not chosen:
            raise ValueError(f"formats for {name} names no file type")
        return chosen
    return loader_formats(value)


def _source(
    name: str,
    value: Any,
    files: list[Path] | None,
    cache: LoaderCache | None,
    formats: tuple[str, ...] | None = None,
) -> Any:
    """The loader to run: the value itself, or its factory run over `files`."""
    if files is None:
        if isinstance(value, LoaderSpec):
            raise TypeError(
                f"{name} is a parser preset, which loads one file at a time; pass paths="
            )
        return value
    factory = value.factory if isinstance(value, LoaderSpec) else value
    if not callable(factory):
        raise TypeError(f"with paths, {name} must be a callable taking a file path")
    return FolderSource(
        factory, files, name=name, cache=cache, tags=loader_tags(value), formats=formats
    )


def _network(name: str, value: Any, allow_network: bool) -> bool:
    if not isinstance(value, LoaderSpec):
        return allow_network
    if value.network and not allow_network:
        raise ValueError(
            f"{name} sends documents to a hosted service; pass allow_network=True to run it"
        )
    return value.network


def _loader_cost(spec: LoaderSpec | None, network: bool, settings: Config) -> ReadingCost:
    """What one page read by this loader costs.

    A parser preset with a price in `pricing.yaml` is its per-page price. A
    loader let onto the network is a hosted service whose price nothing here
    knows. Anything else ran on this machine.
    """
    price = _parser_price(spec, settings)
    if price is not None and price.usd_per_1000_pages is not None:
        return ReadingCost(
            round(price.usd_per_1000_pages / 1000, 6), "estimated", price.display_name
        )
    if network:
        return ReadingCost(None, "unpriced")
    return ReadingCost(0.0, "local")


def _price_readings(
    entries: list[DocumentReport],
    costs: dict[str, ReadingCost],
    tokenizers: dict[str, TokenizerSpec],
) -> None:
    """Attach each loader's per-page cost and token counts to the baseline's pages."""
    for entry in entries:
        for page in entry.extracted_text:
            for name, cost in costs.items():
                if name in page.readings or name == page.kept:
                    page.costs[name] = cost
                if name in page.readings and name not in page.tokens:
                    counted = reading_tokens(page.readings[name], tokenizers)
                    if counted:
                        page.tokens[name] = counted


def _parser_price(spec: LoaderSpec | None, settings: Config) -> ParserPricing | None:
    if spec is None or spec.price_key is None:
        return None
    return settings.pricing.parsers.get(spec.price_key)


def _pages(entry: DocumentReport) -> dict[int, str]:
    return {page.number: page.text for page in entry.extracted_text}


def _whole(pages: dict[int, str]) -> str:
    return "\n\n".join(pages[number] for number in sorted(pages))


def _take_unreturned_documents(
    baseline: Inspection,
    inspections: list[Inspection],
    by_path: list[dict[str, DocumentReport]],
    files: list[Path] | None,
) -> dict[str, int]:
    """Give the report every document some loader returned, and say whose reading it is.

    The report is built from the first loader's entries. A document it did not
    return is taken, as a copy, from the first loader that did, and measured
    against that one. Returns each document's path with the index of its loader.
    """
    owners: dict[str, int] = {}
    for index, entries in enumerate(by_path):
        for path in entries:
            owners.setdefault(path, index)
    borrowed = [copy.deepcopy(by_path[index][path]) for path, index in owners.items() if index != 0]
    if borrowed:
        baseline.entries.extend(borrowed)
        order = {str(path): position for position, path in enumerate(files or [])}
        baseline.entries.sort(key=lambda e: order.get(str(e.path), len(order)))
    return owners


def _readings(
    entry: DocumentReport,
    baseline: Inspection,
    others: list[tuple[Inspection, dict[str, DocumentReport], dict[str, float] | None]],
    seconds: dict[str, float] | None = None,
) -> list[ExtractorReading]:
    """Every loader's reading of one document, the baseline's first.

    `baseline` is the loader the document is measured against, and `seconds` its
    loading time per file, when it ran over files.
    """
    own = _pages(entry)
    readings = [_reading(baseline.loader.name, entry, 1.0, False, _file_seconds(seconds, entry))]
    for inspection, entries, their_seconds in others:
        other = entries.get(str(entry.path))
        if other is None:
            continue
        name = inspection.loader.name
        theirs = _pages(other)
        # Measured on what each loader returned, and shown as the report masks it.
        own_raw = baseline.page_text.get(str(entry.path)) or own
        theirs_raw = inspection.page_text.get(str(other.path)) or theirs
        if entry.page_count_known and other.page_count_known:
            similarity, reordered = _paged_similarity(own_raw, theirs_raw)
            for page in entry.extracted_text:
                page.readings[name] = theirs.get(page.number, "")
        else:
            # Without page numbers on both sides there is nothing to line pages
            # up by, so the document is compared as one run of text.
            left, right = words(_whole(own_raw)), words(_whole(theirs_raw))
            similarity = reading_similarity(left[:MAX_WORDS], right[:MAX_WORDS])
            reordered = similarity < 1.0 and same_words(left, right)
            if len(entry.extracted_text) == 1:
                entry.extracted_text[0].readings[name] = _whole(theirs)
        readings.append(
            _reading(name, other, similarity, reordered, _file_seconds(their_seconds, other))
        )
    return readings


def _file_seconds(seconds: dict[str, float] | None, entry: DocumentReport) -> float:
    return seconds.get(str(entry.path), 0.0) if seconds else 0.0


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
    name: str, entry: DocumentReport, similarity: float, reordered: bool, seconds: float = 0.0
) -> ExtractorReading:
    return ExtractorReading(
        extractor=name,
        characters=sum(page.characters for page in entry.extracted_text),
        mean_coverage_pct=None,
        seconds=seconds,
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

    PyPDF writes `author` where PDFPlumber writes `Author`. A key
    spelled differently is shown under every spelling, joined by a slash.
    Keys are compared file type by file type, between the loaders that returned
    documents of that type.
    """
    spellings: dict[str, list[str]] = {}
    for inspection in inspections:
        for key in inspection.loader.metadata_keys:
            seen = spellings.setdefault(key.casefold(), [])
            if key not in seen:
                seen.append(key)

    uneven: dict[str, list[str]] = {}
    formats = {format_of(path) for i in inspections for path in i.metadata_keys}
    for document_format in sorted(formats):
        returned = {
            i.loader.name: {
                key.casefold()
                for path, keys in i.metadata_keys.items()
                if format_of(path) == document_format
                for key in keys
            }
            for i in inspections
            if any(format_of(path) == document_format for path in i.metadata_keys)
        }
        if len(returned) < 2:
            continue
        for folded in sorted(set().union(*returned.values())):
            if all(folded in keys for keys in returned.values()):
                continue
            names = uneven.setdefault(folded, [])
            names.extend(n for n, keys in returned.items() if folded in keys and n not in names)
    order = [i.loader.name for i in inspections]
    return {
        " / ".join(spellings[folded]): sorted(uneven[folded], key=order.index)
        for folded in sorted(uneven)
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
        meant_for = [i for i in inspections if _covers(i.loader.formats, format_of(path))]
        if len(holders) < len(meant_for):
            uneven[holders[0][1].relative_path] = [name for name, _entry in holders]
    return uneven


def _summary(
    report: AuditReport,
    inspection: Inspection,
    characters: int,
    fact_checks: list[FactCheck] | None,
    price: ParserPricing | None,
    returned: set[str],
) -> LoaderSummary:
    # The baseline's report also holds the documents it took from other loaders.
    entries = [entry for entry in report.documents if str(entry.path) in returned]
    loader = inspection.loader
    pages = sum(entry.page_count for entry in entries)
    return LoaderSummary(
        name=loader.name,
        documents=len(entries),
        pages=pages,
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
        failures=dict(loader.failures),
        cached_files=loader.cached_files,
        tags=list(loader.tags),
        skipped=list(loader.skipped),
        formats=list(loader.formats) if loader.formats is not None else None,
        facts_found=(
            sum(1 for check in fact_checks if check.found.get(loader.name))
            if fact_checks is not None
            else None
        ),
        parser_usd=(
            round(pages * price.usd_per_1000_pages / 1000, 4)
            if price is not None and price.usd_per_1000_pages is not None
            else None
        ),
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

    missing = [
        (
            row.name,
            sum(
                1
                for check in comparison.facts
                if row.name in check.found and not check.found[row.name]
            ),
        )
        for row in comparison.loaders
    ]
    missing = [(name, number) for name, number in missing if number]
    if missing:
        listed = ", ".join(f"{name} ({count(number, 'fact')})" for name, number in missing)
        limitations.append(
            Limitation(
                area="Loaders",
                statement=f"Expected facts were not found in the text of {listed}.",
                affected=sorted(
                    {check.fact for check in comparison.facts if None in check.found.values()}
                ),
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


def _price_limitations(specs: dict[str, LoaderSpec], settings: Config) -> list[Limitation]:
    limitations: list[Limitation] = []
    for name, spec in specs.items():
        price = _parser_price(spec, settings)
        if spec.price_key is not None and price is None:
            statement = (
                f"No price is configured for {name}; add {spec.price_key} under parsers in "
                f"pricing.yaml to estimate its cost."
            )
        elif price is not None and price.usd_per_1000_pages is None:
            statement = (
                f"{price.display_name} has no price configured, so its cost is not estimated."
            )
        elif price is not None and price.last_verified is None and price.usd_per_1000_pages:
            statement = (
                f"The {price.display_name} price of ${price.usd_per_1000_pages:,.2f} per 1,000 "
                f"pages has not been verified against the provider's pricing page."
            )
        else:
            continue
        limitations.append(Limitation(area="Parser prices", statement=statement, severity="info"))
    return limitations


def _covers(formats: Sequence[str] | None, document_format: str) -> bool:
    """Whether a loader meant for these extensions reads documents of this format."""
    if formats is None:
        return True
    return any(SUFFIX_FORMATS.get(suffix) == document_format for suffix in formats)


def _fact_format(check: FactCheck) -> str | None:
    """The file type a fact belongs to: its document's, or where a loader found it."""
    where = check.document or next((d for d in check.documents.values() if d), None)
    return format_of(where) if where else None


def _format_comparisons(
    inspections: list[Inspection],
    by_path: list[dict[str, DocumentReport]],
    documents: list[DocumentReport],
    files: list[Path] | None,
    seconds: list[dict[str, float] | None],
    fact_checks: list[FactCheck],
    with_facts: bool,
) -> list[FormatComparison]:
    """The comparison repeated for each file type, over the loaders meant for it."""
    paths: list[str] = [str(path) for path in files or []]
    for entries in by_path:
        paths.extend(entries)
    for inspection in inspections:
        paths.extend(inspection.loader.failures)
    groups: dict[str, list[str]] = {}
    for path in dict.fromkeys(paths):
        groups.setdefault(format_of(path), []).append(path)
    report_entries = {str(entry.path): entry for entry in documents}
    order = list(FORMAT_LABELS)

    comparisons: list[FormatComparison] = []
    for document_format in sorted(groups, key=order.index):
        here = groups[document_format]
        facts = [c for c in fact_checks if _fact_format(c) == document_format]
        rows: list[FormatLoaderRow] = []
        skipped_by: list[str] = []
        for inspection, entries, timing in zip(inspections, by_path, seconds, strict=True):
            loader = inspection.loader
            if not _covers(loader.formats, document_format):
                skipped_by.append(loader.name)
                continue
            returned = [entries[path] for path in here if path in entries]
            similarities = [
                reading.similarity
                for path in here
                if path in report_entries
                for reading in report_entries[path].extractions
                if reading.extractor == loader.name and reading.similarity is not None
            ]
            rows.append(
                FormatLoaderRow(
                    name=loader.name,
                    documents=len(returned),
                    pages=sum(entry.page_count for entry in returned),
                    characters=sum(
                        page.characters for entry in returned for page in entry.extracted_text
                    ),
                    seconds=(
                        round(sum(timing.get(path, 0.0) for path in here), 3)
                        if timing is not None
                        else None
                    ),
                    similarity=(
                        round(sum(similarities) / len(similarities), 4) if similarities else None
                    ),
                    failures={
                        path: reason
                        for path, reason in loader.failures.items()
                        if format_of(path) == document_format
                    },
                    facts_found=(
                        sum(1 for check in facts if check.found.get(loader.name))
                        if with_facts
                        else None
                    ),
                    error=loader.error,
                )
            )
        verdict = _format_verdict(
            FORMAT_LABELS.get(document_format, str(document_format)),
            rows,
            len(facts),
            [report_entries[p] for p in here if p in report_entries],
        )
        comparisons.append(
            FormatComparison(
                format=str(document_format),
                label=FORMAT_LABELS.get(document_format, str(document_format)),
                documents=len(here),
                loaders=rows,
                skipped_by=skipped_by,
                facts=len(facts),
                recommended=verdict.recommended,
                verdict=verdict.reason,
                ranked=verdict.ranked,
            )
        )
    return comparisons


def _format_verdict(
    label: str, rows: list[FormatLoaderRow], facts: int, documents: list[DocumentReport]
) -> LoaderVerdict:
    """The verdict for one file type, which may have one loader meant for it, or none."""
    if not rows:
        return LoaderVerdict(reason=f"none of the loaders is meant for {label} files")
    if len(rows) == 1:
        return LoaderVerdict(
            reason=f"{rows[0].name} is the only loader meant for {label} files",
            ranked=[rows[0].name],
        )
    return recommend_rows(rows, facts, documents)


def _for_loaders_meant_for(check: FactCheck, inspections: list[Inspection]) -> FactCheck:
    """The fact as checked by the loaders meant for its file type only.

    A fact in a PDF says nothing about a Word loader that was never given the PDF,
    so that loader is left out of the check rather than counted as missing it.
    """
    document_format = _fact_format(check)
    if document_format is None:
        return check
    meant = {i.loader.name for i in inspections if _covers(i.loader.formats, document_format)}
    if meant >= set(check.found):
        return check

    def only(values: dict[str, Any]) -> dict[str, Any]:
        return {name: value for name, value in values.items() if name in meant}

    return dataclasses.replace(
        check,
        found=only(check.found),
        scores=only(check.scores),
        pages=only(check.pages),
        documents=only(check.documents),
        nearest=only(check.nearest),
    )
