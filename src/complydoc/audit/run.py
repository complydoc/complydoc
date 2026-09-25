"""Run the requested components over a target path and assemble one report.

The three components are independent. Asking for only the sensitive data scan
loads no tokenizer and computes no cost, and the report records which
components were run.

With `jobs` above one the documents are spread over a process pool. That is a
wall-clock decision and nothing else: documents are analysed independently, so
the report comes out the same either way, and `tests/test_parallel.py` asserts
it. Because the pool uses spawn, code calling `run_audit` from a script must
guard its entry point with `if __name__ == "__main__":`, as with any use of
multiprocessing. The console entry point already does.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import os
import platform
import re
import sys
import time
from collections import deque
from collections.abc import Callable, Iterator, Sequence
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass
from multiprocessing import get_all_start_methods, get_context
from pathlib import Path
from typing import Any

from complydoc import __version__, offline
from complydoc.audit.discovery import discover
from complydoc.audit.sampling import sample_files
from complydoc.config.loader import check_staleness
from complydoc.config.schema import CategoryConfig, Config, ModelPricing, TokenizerSpec
from complydoc.cost.estimator import estimate_document, folder_from_estimates, resolve_models
from complydoc.cost.tokenizer import count_tokens, tokenizer_key
from complydoc.cost.vision import vision_tokens
from complydoc.extraction.routing import plan_routes
from complydoc.hidden.check import check_content
from complydoc.hidden.instructions import (
    classifier_calls,
    register_instruction_classifier,
    resolve_classifier,
)
from complydoc.ingest import ocr as ocr_module
from complydoc.ingest.base import (
    TIMED_OUT,
    Document,
    IngestOptions,
    LoaderError,
    Page,
    SkipRecord,
)
from complydoc.ingest.extractors.registry import DEFAULT_EXTRACTOR
from complydoc.ingest.registry import load_document
from complydoc.readiness.analyser import analyse
from complydoc.report.limitations import build_limitations
from complydoc.report.models import (
    SCHEMA_VERSION,
    AuditReport,
    DocumentReport,
    DocumentTiming,
    DocumentVerification,
    ExtractorReading,
    PageText,
    ReadingCost,
    RunMetadata,
    build_aggregate,
)
from complydoc.report.overall import overall_readiness
from complydoc.report.preview import build_previews
from complydoc.report.quickwins import quick_wins
from complydoc.report.routing import summarise_routes
from complydoc.report.verification import summarise_verification
from complydoc.sensitive.base import SensitiveMatch
from complydoc.sensitive.scanner import ScanResult, scan, scan_text
from complydoc.utils.files import relative_to_root
from complydoc.verification.check import verify_document
from complydoc.verification.vision import (
    VERIFY_SCOPES,
    VisionModel,
    model_name,
    register_vision_model,
    registered_vision_model,
    resolve_vision,
)

__all__ = ["COMPONENTS", "resolve_jobs", "run_audit"]

COMPONENTS: tuple[str, ...] = ("cost", "readiness", "sensitive")

_MAX_TEXT_CHARS = 20_000
"""Per page, so one enormous document cannot make the report unopenable."""


def _hosts_sent_content() -> list[str]:
    """Hosts a registered classifier sent document text to, if any.

    Nothing in complydoc reaches the network on its own. A caller can register a
    classifier that does, and a report that did not say so would leave the one
    fact a reader most needs to know to whoever set the run up.
    """
    try:
        from complydoc.integrations.typesafe import connections_made
    except ImportError:  # pragma: no cover - the extra is not installed
        return []

    # The guard records what it saw: a DNS lookup, then a connection to an
    # address. What belongs in a report is the name of the place, once.
    hosts: list[str] = []
    for connection in connections_made():
        match = re.search(r"DNS lookup of '([^']+)'", connection)
        name = match.group(1) if match else None
        if name and name not in hosts:
            hosts.append(name)
    return hosts


def _classifier_missed(spec: str | None, jobs: int, files: int, recovered: int) -> int:
    """Documents a registered classifier could not be asked about.

    A classifier named by `--classifier` crosses into every worker, which
    resolves its own, so nothing is missed at any job count. A classifier a
    caller registered through `register_instruction_classifier` is a function in
    this process and cannot cross, so documents read in a worker went unjudged —
    except the ones a failed pool handed back, which were read here after all.
    """
    from complydoc.hidden.instructions import registered_classifier

    if spec is not None or registered_classifier() is None or jobs <= 1:
        return 0
    return max(0, files - recovered)


def ner_available(config: Config) -> bool:
    """Whether every category read by a model has a model that loads.

    A category can name several detectors, to be tried in order, so this asks
    whether any link of each chain can run rather than whether one particular
    library is installed.
    """
    from complydoc.sensitive.registry import detector_by_id

    categories = [c for c in config.sensitive.enabled_categories.values() if c.model_backed]
    if not categories:
        return False

    def runs(detector_id: str, category: CategoryConfig) -> bool:
        if detector_by_id(detector_id) is None:
            return False
        if category.model is None:
            return True
        return _model_loads(detector_id, category.model.name)

    return all(any(runs(d, cat) for d, cat in c.chain()) for c in categories)


def _model_loads(detector_id: str, model_name: str) -> bool:
    """Whether the named model can be loaded by the detector that wants it."""
    from complydoc.sensitive.detectors import ner, token_classifier

    module = {"ner": ner, "token_classifier": token_classifier}.get(detector_id)
    if module is None:
        return True
    return bool(module.model_available(model_name)[0])


@dataclass(frozen=True, slots=True)
class Work:
    """Everything analysing one document needs, and nothing that it does not.

    Kept picklable on purpose: with `--jobs` this is what crosses into each
    worker process. A `Document` never crosses back — it holds page rasters and
    is far larger than the report entry derived from it — so cost is estimated
    where the document already is, and only the finished entry is returned.
    """

    config: Config
    options: IngestOptions
    target: Path
    requested: tuple[str, ...]
    reveal: bool
    previews: bool
    page_images: bool
    extracted_text: bool
    models: tuple[ModelPricing, ...] | None
    today: dt.date
    classifier: str | None = None
    """The classifier to register in whichever process reads the document.

    A classifier is a function, and a function does not cross into a worker. Its
    name does, so each worker resolves and registers its own.
    """
    verifying: bool = False
    """Read pages again with the registered vision model."""
    verify_spec: str | None = None
    """The `vision:module:function` each worker resolves, as for `classifier`.

    None with `verifying` set means a model object registered in this process,
    which cannot cross, so the run is kept to this process.
    """
    verify_scope: str = "flagged"
    resolution: str = "medium"
    """The headline vision resolution: what a page is rendered at and priced at."""


@dataclass(frozen=True, slots=True)
class _Outcome:
    entry: DocumentReport | None
    skipped: SkipRecord | None
    ocr_pages: int = 0
    ocr_seconds: float = 0.0
    classifier_calls: int = 0
    classifier_failures: int = 0
    classifier_hosts: tuple[str, ...] = ()
    """Hosts a classifier reached while this document was scored.

    Recorded per document for the same reason as the counts: a worker's record
    of where it sent text is module state in that process, and dies with it. A
    parallel run would otherwise report that nothing left the machine while
    every worker was sending passages to a third party.
    """
    """Calls a registered classifier made for this document, and how many failed.

    A failed call is no score, and no score is no finding, so a run whose calls
    all failed produced the same report as a run that found nothing. These
    travel back from the worker so the report can tell those two apart.
    """
    recovered: bool = False
    """Read in the main process after a worker process stopped."""


def extractor_readings(document: Document) -> list[ExtractorReading]:
    """Each extractor's reading of the whole document, totalled over its pages.

    Order is preserved: the first is the one whose output the findings were
    built from, and the rest are there to be compared against it.
    """
    order: list[str] = []
    totals: dict[str, list[float]] = {}
    shape: dict[str, tuple[str, bool]] = {}
    worst: dict[str, float] = {}
    # A document counts as reordered only if every page that differed did so by
    # holding the same words. One page of different words is reported instead.
    shuffled: dict[str, bool] = {}

    for page in document.pages:
        for summary in page.extractions:
            if summary.extractor not in totals:
                order.append(summary.extractor)
                totals[summary.extractor] = [0.0, 0.0, 0.0, 0.0, 0.0]
                shape[summary.extractor] = (summary.granularity, summary.reads_tables)
            row = totals[summary.extractor]
            row[0] += summary.characters
            row[2] += summary.seconds
            row[3] += 1
            if summary.coverage_pct is not None:
                row[1] += summary.coverage_pct
                row[4] += 1
            worst[summary.extractor] = min(worst.get(summary.extractor, 1.0), summary.similarity)
            if summary.similarity < 1.0 and not summary.reordered:
                shuffled[summary.extractor] = False
            elif summary.reordered:
                shuffled.setdefault(summary.extractor, True)

    readings: list[ExtractorReading] = []
    for name in order:
        characters, coverage, seconds, _pages, measured = totals[name]
        granularity, reads_tables = shape[name]
        readings.append(
            ExtractorReading(
                extractor=name,
                characters=int(characters),
                mean_coverage_pct=round(coverage / measured, 2) if measured else None,
                seconds=round(seconds, 4),
                granularity=granularity,
                reads_tables=reads_tables,
                # The worst page's similarity, so one scrambled page is reported.
                similarity=round(worst.get(name, 1.0), 4),
                reordered=shuffled.get(name, False),
            )
        )
    return readings


def _mask(text: str, work: Work, located: list[SensitiveMatch] | None = None) -> str:
    """`text` with its identifiers covered, unless the run reveals them."""
    # Imported here: extract builds on the audit, which builds on this module.
    from complydoc.extraction.extract import mask_matches

    if not text.strip():
        return text
    if located is None:
        located, _unavailable = scan_text(text, work.config.sensitive, reveal=work.reveal)
    if work.reveal:
        located = [m for m in located if m.revealed is None]
    return mask_matches(text, located)[0]


_LOCAL = ReadingCost(0.0, "local")
"""A reader that ran on this machine: machine time, and no bill."""


def _kept_by(page: Page, work: Work, verification: DocumentVerification | None) -> str:
    """The reader whose text a page kept."""
    if page.text_source == "vision" and verification is not None:
        return verification.model
    if page.text_source == "ocr":
        return ocr_module.engine_name()
    if page.text_source in ("native", "loader"):
        return work.options.extractor
    return ""


def _reading_costs(
    page: Page, kept: str, verification: DocumentVerification | None
) -> dict[str, ReadingCost]:
    """What each reading of a page cost: nothing for a local reader, a price for vision."""
    costs = dict.fromkeys(page.readings, _LOCAL)
    if kept:
        costs[kept] = _LOCAL
    if page.ocr_text.strip():
        costs["ocr"] = _LOCAL
    if verification is not None:
        for checked in verification.pages:
            if checked.number == page.number and checked.cost is not None:
                costs[verification.model] = checked.cost
    return costs


def tokenizers_of(models: Sequence[ModelPricing] | None) -> dict[str, TokenizerSpec]:
    """Each distinct way the priced models count text, by `tokenizer_key`."""
    return {tokenizer_key(m.tokenizer): m.tokenizer for m in models or ()}


def reading_tokens(text: str, tokenizers: dict[str, TokenizerSpec]) -> dict[str, int]:
    """Text tokens in one reading, once per way of counting."""
    if not text.strip():
        return {}
    return {key: count_tokens(text, spec).tokens for key, spec in tokenizers.items()}


def _page_tokens(
    page: Page, kept: str, tokenizers: dict[str, TokenizerSpec]
) -> dict[str, dict[str, int]]:
    """Every reading of a page counted, keyed like its costs, so each can be priced per model."""
    if not tokenizers:
        return {}
    texts = dict(page.readings)
    if kept:
        texts[kept] = page.text
    if page.ocr_text.strip():
        texts["ocr"] = page.ocr_text
    counted = {name: reading_tokens(text, tokenizers) for name, text in texts.items()}
    return {name: tokens for name, tokens in counted.items() if tokens}


def _image_tokens(entry: DocumentReport, work: Work) -> dict[int, dict[str, int]]:
    """Per page, image tokens under each vision formula the priced models use."""
    if entry.cost is None or not work.models:
        return {}
    pricing = work.config.pricing
    formulas = {
        name: pricing.vision_formulas[name]
        for model in work.models
        if model.supports_vision and (name := model.vision_formula or "") in pricing.vision_formulas
    }
    counted: dict[int, dict[str, int]] = {}
    for facts in entry.cost.pages:
        size = facts.rendered.get(work.resolution)
        if size is None or size.width_px <= 0 or size.height_px <= 0:
            continue
        counted[facts.number] = {name: vision_tokens(size, f) for name, f in formulas.items()}
    return counted


def _vision_estimates(entry: DocumentReport, resolution: str) -> dict[int, ReadingCost]:
    """Per page, the cheapest priced vision model's estimated cost, at `resolution`."""
    if entry.cost is None:
        return {}
    estimates: dict[int, ReadingCost] = {}
    for index, facts in enumerate(entry.cost.pages):
        best: ReadingCost | None = None
        for model in entry.cost.models:
            usd = model.vision_page_usd(resolution, index)
            # No tokens is a page whose size is unknown, not a free page.
            if not usd:
                continue
            if best is None or (best.usd is not None and usd < best.usd):
                tokens = model.vision_tokens_by_page[resolution][index]
                best = ReadingCost(round(usd, 6), "estimated", model.display_name, tokens)
        if best is not None:
            estimates[facts.number] = best
    return estimates


def _page_text(
    page: Page,
    scanned: ScanResult | None,
    work: Work,
    verification: DocumentVerification | None = None,
    vision_estimate: ReadingCost | None = None,
    image_tokens: dict[str, int] | None = None,
) -> PageText:
    """A page's text for the report, with its identifiers masked.

    The findings table masks every value, and the text beside it used to carry
    the same values in full, so a report shared for its findings shared the
    identifiers too. The page's own text is masked with the findings already
    located on it. Every other reading of the page (another extractor, OCR)
    places its characters differently, so each is scanned for itself; that
    costs a scan per extra reading, and only when readings are being compared.

    With --reveal the values are left, except in the categories configured
    never to be revealed.
    """
    matches: list[SensitiveMatch] | None = None
    if scanned is not None:
        matches = [m for m in scanned.matches if m.page == page.number]

    def masked(text: str, located: list[SensitiveMatch] | None = None) -> str:
        return _mask(text, work, located)

    text = masked(page.text, matches)
    kept = _kept_by(page, work, verification)
    return PageText(
        number=page.number,
        source=page.text_source,
        characters=len(page.text),
        text=text[:_MAX_TEXT_CHARS],
        ocr_text=masked(page.ocr_text)[:_MAX_TEXT_CHARS],
        truncated=len(page.text) > _MAX_TEXT_CHARS,
        readings={
            name: (text if reading == page.text else masked(reading))[:_MAX_TEXT_CHARS]
            for name, reading in page.readings.items()
        },
        kept=kept,
        costs=_reading_costs(page, kept, verification),
        tokens=_page_tokens(page, kept, tokenizers_of(work.models)),
        image_tokens=image_tokens or {},
        vision_estimate=vision_estimate,
    )


def _verify(document: Document, entry: DocumentReport, work: Work) -> DocumentVerification | None:
    """Read the document's pages again with the vision model registered in this process."""
    model = registered_vision_model()
    if model is None or entry.routing is None:
        return None
    routing = work.config.readiness.routing
    return verify_document(
        document,
        entry.routing,
        model,
        pricing=work.config.pricing,
        scope=work.verify_scope,
        resolution=work.resolution,
        min_characters=routing.min_characters,
        min_coverage=routing.verify_min_coverage_pct / 100,
        missing_words=routing.verify_missing_words,
        password=work.options.password,
        mask=lambda text: _mask(text, work),
    )


def build_entry(
    document: Document, work: Work, read_seconds: float, relative_path: str
) -> DocumentReport:
    """A report entry for a document that has already been read.

    Separate from reading so loader output, which has no file to read, goes
    through the same steps.
    """
    entry = DocumentReport(
        path=document.path,
        relative_path=relative_path,
        sha256=document.sha256,
        format=document.format,
        page_count=document.page_count,
        page_count_known=document.page_count_known,
        load_warnings=list(document.load_warnings),
    )

    entry.extractions = extractor_readings(document)
    entry.routing = plan_routes(document, work.config.readiness.routing)

    analyse_started = time.perf_counter()
    if "readiness" in work.requested:
        entry.readiness = analyse(document, work.config.readiness)
    analyse_seconds = time.perf_counter() - analyse_started

    # Priced before verification can fill a page: the text path is what the
    # document's own text costs, not what a vision model recovered from it.
    if work.models is not None:
        entry.cost = estimate_document(document, work.config.pricing, work.today, list(work.models))
    # Before the scan, so a page only the vision model could read is searched too.
    if work.verifying:
        entry.verification = _verify(document, entry, work)

    scan_started = time.perf_counter()
    if "sensitive" in work.requested:
        entry.sensitive = scan(document, work.config.sensitive, reveal=work.reveal)
        check = check_content(
            document.path,
            [(page.number, page.text) for page in document.pages],
            work.config,
            reveal=work.reveal,
            password=work.options.password or "",
            loader_text=any(page.text_source == "loader" for page in document.pages),
        )
        entry.content_findings = check.findings
        entry.visibility_checked = check.visibility_checked
        entry.visibility_note = check.note
    scan_seconds = time.perf_counter() - scan_started

    if work.previews:
        entry.previews = build_previews(
            document,
            entry.sensitive,
            page_images=work.page_images,
            categories=work.config.sensitive,
        )
    if work.extracted_text:
        estimates = _vision_estimates(entry, work.resolution)
        images = _image_tokens(entry, work)
        entry.extracted_text = [
            _page_text(
                page,
                entry.sensitive,
                work,
                entry.verification,
                estimates.get(page.number),
                images.get(page.number),
            )
            for page in document.pages
        ]

    total_seconds = read_seconds + analyse_seconds + scan_seconds
    entry.timing = DocumentTiming(
        read_seconds=round(read_seconds, 3),
        analyse_seconds=round(analyse_seconds, 3),
        scan_seconds=round(scan_seconds, 3),
        total_seconds=round(total_seconds, 3),
        seconds_per_page=(
            round(total_seconds / document.page_count, 3) if document.page_count else None
        ),
    )
    return entry


def _process(path: Path, work: Work) -> _Outcome:
    """Read one document and produce its report entry. Never raises."""
    ocr_before = ocr_module.stats()
    read_started = time.perf_counter()
    try:
        document = load_document(path, work.options)
    except LoaderError as exc:
        return _Outcome(None, SkipRecord(path=path, reason="could not be parsed", detail=str(exc)))
    # Parsers raise their own exception types on malformed files. Any of them
    # skips this one file, and the run continues.
    except Exception as exc:
        return _Outcome(
            None,
            SkipRecord(
                path=path,
                reason="unexpected error while reading",
                detail=f"{type(exc).__name__}: {exc}",
            ),
        )
    read_seconds = time.perf_counter() - read_started

    entry = build_entry(document, work, read_seconds, relative_to_root(document.path, work.target))
    ocr_after = ocr_module.stats()
    # Read and reset: whatever the classifier was asked during this document,
    # in whichever process this is.
    calls, failures = classifier_calls()
    return _Outcome(
        entry,
        None,
        ocr_after[0] - ocr_before[0],
        ocr_after[1] - ocr_before[1],
        calls,
        failures,
        tuple(_hosts_sent_content()),
    )


_WORKER_WORK: Work | None = None


def _pool_context() -> Any:
    """How to start the workers.

    Forkserver where it exists: the server process loads the tokenizer, the
    language model and the entity model once, and every worker forks from it
    with those already in memory. Under spawn each worker loads its own copy,
    which on a folder of small documents costs more than the work itself.

    Never a plain fork of this process. The OCR engine holds native threads, and
    forking a process that has them is a known way to hang a child; the
    forkserver is started before any of that exists.

    Spawn once torch has been imported here. The forkserver is started on
    demand, from this process, so it inherits whatever this process has already
    initialised — and a worker forked from an address space where torch has
    brought up Metal and Objective-C state dies the moment it does real work,
    as `BrokenProcessPool`. `warm` refuses to preload the entity model for this
    reason; what it could not account for is that a scan loads that model here
    too, by way of `ner_available`, which every audit calls to fill a field in
    its report. So the first audit in a process forks cleanly and every one
    after it would not, which is why this was invisible until an audit ran twice.
    Nothing is lost but the preload's measured six per cent, and a run that
    completes beats one that quietly reads every document in this process.
    """
    if "torch" in sys.modules:
        return get_context("spawn")
    if "forkserver" in get_all_start_methods():
        context = get_context("forkserver")
        context.set_forkserver_preload(["complydoc.audit.warm"])
        return context
    return get_context("spawn")


_CLASSIFIER_TOTALS = [0, 0]
"""Calls and failures across every process of one run, added up as they return."""

_CLASSIFIER_HOSTS: list[str] = []
"""Every host any process sent document text to, in the order first seen."""


def _count_classifier(outcome: _Outcome) -> None:
    _CLASSIFIER_TOTALS[0] += outcome.classifier_calls
    _CLASSIFIER_TOTALS[1] += outcome.classifier_failures
    for host in outcome.classifier_hosts:
        if host not in _CLASSIFIER_HOSTS:
            _CLASSIFIER_HOSTS.append(host)


def _worker_init(work: Work) -> None:
    """Set up a worker process. The network guard is armed here too.

    A guard that only holds in the parent would be no guard at all, so every
    process that opens a document arms it before it opens anything.

    The native thread pools are pinned to one thread each. OCR otherwise spreads
    one page across every core, so without this the workers spend their time
    fighting each other for the same cores and the run gets slower. It has to
    happen before the OCR engine is built.
    """
    global _WORKER_WORK
    for variable in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
        os.environ.setdefault(variable, "1")
    ocr_module.set_threads(1)
    offline.arm()
    if work.classifier is not None:
        # After the guard, and after the fork rather than in the preload: a
        # classifier of the caller's may load a model, and `warm` is explicit
        # that a process which has done that is not safe to fork from.
        register_instruction_classifier(resolve_classifier(work.classifier))
    if work.verify_spec is not None:
        register_vision_model(resolve_vision(work.verify_spec))
    _WORKER_WORK = work


def _worker(path: Path) -> _Outcome:
    assert _WORKER_WORK is not None
    return _process(path, _WORKER_WORK)


def _process_pool(jobs: int, work: Work) -> ProcessPoolExecutor:
    return ProcessPoolExecutor(
        max_workers=jobs,
        mp_context=_pool_context(),
        initializer=_worker_init,
        initargs=(work,),
    )


def _kill(pool: ProcessPoolExecutor) -> None:
    """Stop a pool whose worker has hung inside a parser.

    `shutdown` waits for the running document, which is the one that has stopped
    responding, so the workers are killed first. `_processes` is private to the
    executor, and there is no public way to reach them.
    """
    for process in list(getattr(pool, "_processes", {}).values()):
        process.kill()
    pool.shutdown(wait=False, cancel_futures=True)


def _timed(files: list[Path], work: Work, jobs: int, timeout: float) -> Iterator[_Outcome]:
    """Outcomes in order, giving each document `timeout` seconds of its own.

    Only killing the process stops a document stuck inside a parser's native code,
    so a run with a timeout always uses workers, even with one job. One document
    per worker is in flight and the oldest is always waited on, so results keep the
    order the files were discovered. A document that passes its deadline is
    recorded as skipped, the workers are killed, the documents that were in flight
    go back in the queue, and a new pool carries on with them.
    """
    queue = deque(files)
    in_flight: dict[Future[_Outcome], tuple[Path, float]] = {}
    pool = _process_pool(jobs, work)
    try:
        while queue or in_flight:
            while queue and len(in_flight) < jobs:
                path = queue.popleft()
                in_flight[pool.submit(_worker, path)] = (path, time.monotonic())
            future, (path, began) = next(iter(in_flight.items()))
            try:
                outcome = future.result(timeout=max(0.0, timeout - (time.monotonic() - began)))
            except TimeoutError:
                del in_flight[future]
                queue.extendleft(reversed([p for p, _began in in_flight.values()]))
                in_flight.clear()
                _kill(pool)
                pool = _process_pool(jobs, work)
                yield _Outcome(
                    None,
                    SkipRecord(
                        path=path,
                        reason=TIMED_OUT,
                        detail=f"no result after {timeout:g}s",
                    ),
                )
            except BrokenProcessPool:
                waiting = [path, *(p for p, _began in in_flight.values()), *queue]
                in_flight.clear()
                queue.clear()
                for remaining in waiting:
                    recovered = dataclasses.replace(_process(remaining, work), recovered=True)
                    _count_classifier(recovered)
                    yield recovered
            else:
                del in_flight[future]
                ocr_module.add_stats(outcome.ocr_pages, outcome.ocr_seconds)
                _count_classifier(outcome)
                yield outcome
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def _outcomes(
    files: list[Path], work: Work, jobs: int, timeout: float | None = None
) -> Iterator[_Outcome]:
    """Results in the order the files were discovered, serial or parallel.

    If a worker process stops, for example by crashing inside a native library, the
    pool cannot continue. The documents that had not come back are then read in this
    process and marked `recovered`, so the run completes with every document.

    With `timeout`, each document is given that many seconds and the run always uses
    workers, because a document can only be stopped by killing the process reading it.
    """
    if timeout is not None and timeout > 0 and files:
        yield from _timed(files, work, max(1, jobs), timeout)
        return
    if jobs <= 1 or len(files) < 2:
        for path in files:
            outcome = _process(path, work)
            _count_classifier(outcome)
            yield outcome
        return

    returned = 0
    try:
        with _process_pool(jobs, work) as pool:
            for outcome in pool.map(_worker, files, chunksize=1):
                ocr_module.add_stats(outcome.ocr_pages, outcome.ocr_seconds)
                _count_classifier(outcome)
                returned += 1
                yield outcome
    except BrokenProcessPool:
        for path in files[returned:]:
            recovered = dataclasses.replace(_process(path, work), recovered=True)
            _count_classifier(recovered)
            yield recovered


_MIN_DOCUMENTS_PER_WORKER = 12
"""Below this, a worker costs more to start than the documents it would read.

Each one loads its own OCR engine, so a handful of documents spread over every
core spends its time on start-up. Measured on a folder of a hundred documents:
one process 13.6s, four 11.4s, eight 10.1s, and a folder of fifteen is quicker
in one process than in eleven.
"""


def resolve_jobs(jobs: int, files: int) -> int:
    """How many processes to use. 0 decides from the size of the folder."""
    if jobs == 0:
        jobs = min(os.cpu_count() or 1, files // _MIN_DOCUMENTS_PER_WORKER)
    return max(1, min(jobs, max(1, files)))


@dataclass(frozen=True, slots=True)
class AuditPlan:
    """The files an audit will read and how it will read them."""

    files: list[Path]
    skipped: list[SkipRecord]
    work: Work
    jobs: int
    timeout: float | None
    requested: list[str]
    found: int
    extractor: str


def plan_audit(
    target: Path,
    config: Config,
    components: Sequence[str] = COMPONENTS,
    *,
    ocr: bool = False,
    reveal: bool = False,
    select_models: Sequence[str] | None = None,
    recurse: bool = True,
    previews: bool = True,
    page_images: bool = False,
    extracted_text: bool = False,
    ocr_compare: bool = False,
    render_dpi: int = 150,
    password: str = "",
    extractor: str | None = None,
    compare_extractors: Sequence[str] = (),
    compare_engines: Sequence[str] = (),
    jobs: int = 1,
    sample: int | None = None,
    timeout: float | None = None,
    classifier_spec: str | None = None,
    verify: bool = False,
    verify_spec: str | None = None,
    verify_scope: str = "flagged",
    resolution: str = "medium",
) -> AuditPlan:
    """Discover the files and settle how each will be read, before opening any."""
    requested = [c for c in COMPONENTS if c in set(components)]
    target = target.expanduser().resolve()
    files, skipped = discover(target, recurse=recurse)
    found = len(files)
    if sample is not None and sample < found:
        files = sample_files(files, sample)

    # Pages are rasterised only for OCR, page images, OCR comparison or the skew signal.
    wants_raster = ocr or page_images or ocr_compare or "readiness" in requested
    options = IngestOptions(
        ocr=ocr,
        render_dpi=render_dpi,
        extract_tables="readiness" in requested,
        render_all_pages=page_images or ocr_compare,
        ocr_compare=ocr_compare,
        max_render_pages=50 if (wants_raster or page_images) else 0,
        password=password,
        extractor=extractor or DEFAULT_EXTRACTOR,
        compare_extractors=tuple(compare_extractors),
        compare_engines=tuple(compare_engines),
        # Several readings of every page are only kept when the run keeps text.
        keep_readings=extracted_text and bool(compare_extractors or compare_engines),
    )

    ocr_module.reset_stats()
    work = Work(
        config=config,
        options=options,
        target=target,
        requested=tuple(requested),
        reveal=reveal,
        previews=previews,
        page_images=page_images,
        extracted_text=extracted_text,
        models=(
            tuple(resolve_models(config.pricing, select_models)) if "cost" in requested else None
        ),
        today=dt.date.today(),
        classifier=classifier_spec,
        verifying=verify,
        verify_spec=verify_spec,
        verify_scope=verify_scope,
        resolution=resolution,
    )
    return AuditPlan(
        files=files,
        skipped=skipped,
        work=work,
        jobs=resolve_jobs(jobs, len(files)),
        timeout=timeout,
        requested=requested,
        found=found,
        extractor=extractor or DEFAULT_EXTRACTOR,
    )


def iter_entries(plan: AuditPlan, *, guard: bool = True) -> Iterator[DocumentReport | SkipRecord]:
    """Each skipped file, then each document's entry as it is read.

    The network guard is armed only while a document is being read.
    """
    yield from plan.skipped
    outcomes = _outcomes(plan.files, plan.work, plan.jobs, plan.timeout)
    while True:
        with offline.guarded(guard):
            outcome = next(outcomes, None)
        if outcome is None:
            return
        if outcome.skipped is not None:
            yield outcome.skipped
        if outcome.entry is not None:
            yield outcome.entry


def run_audit(
    target: Path,
    config: Config,
    components: Sequence[str] = COMPONENTS,
    *,
    ocr: bool = False,
    reveal: bool = False,
    monthly_volume: int | None = None,
    resolution: str = "medium",
    select_models: Sequence[str] | None = None,
    recurse: bool = True,
    previews: bool = True,
    page_images: bool = False,
    extracted_text: bool = False,
    ocr_compare: bool = False,
    render_dpi: int = 150,
    password: str = "",
    extractor: str | None = None,
    compare_extractors: Sequence[str] = (),
    compare_engines: Sequence[str] = (),
    jobs: int = 1,
    sample: int | None = None,
    timeout: float | None = None,
    classifier_spec: str | None = None,
    verify_with: str | VisionModel | None = None,
    verify_scope: str = "flagged",
    progress: Callable[[int, int, Path], None] | None = None,
) -> AuditReport:
    """Audit `target` and assemble the report.

    `verify_with` reads pages again with a vision model: a `vision:module:function`
    spec, which crosses into worker processes, or a model object, which keeps the
    run in this process. `verify_scope` is `flagged` or `all`.
    """
    started = time.monotonic()
    started_at = dt.datetime.now().astimezone()
    # A caller can run several audits in one process, and last run's calls are
    # not this run's.
    _CLASSIFIER_TOTALS[:] = (0, 0)
    _CLASSIFIER_HOSTS.clear()
    if classifier_spec is not None:
        register_instruction_classifier(resolve_classifier(classifier_spec))
    verify_spec, verify_name = vision_setup(verify_with, verify_scope)
    if verify_with is not None and verify_spec is None:
        # A model object is a function in this process and cannot cross into a
        # worker, so every document is read here, where it is.
        jobs, timeout = 1, None
    plan = plan_audit(
        target,
        config,
        components,
        ocr=ocr,
        reveal=reveal,
        select_models=select_models,
        recurse=recurse,
        previews=previews,
        page_images=page_images,
        extracted_text=extracted_text,
        ocr_compare=ocr_compare,
        render_dpi=render_dpi,
        password=password,
        extractor=extractor,
        compare_extractors=compare_extractors,
        compare_engines=compare_engines,
        jobs=jobs,
        sample=sample,
        timeout=timeout,
        classifier_spec=classifier_spec,
        verify=verify_with is not None,
        verify_spec=verify_spec,
        verify_scope=verify_scope,
        resolution=resolution,
    )
    files, skipped, work, jobs = plan.files, plan.skipped, plan.work, plan.jobs
    requested, found, chosen_extractor = plan.requested, plan.found, plan.extractor
    target = work.target
    sampled = len(files) < found

    documents: list[DocumentReport] = []
    recovered = 0
    try:
        for index, outcome in enumerate(_outcomes(files, work, jobs, plan.timeout), start=1):
            recovered += outcome.recovered
            if progress is not None:
                progress(index, len(files), files[index - 1])
            if outcome.skipped is not None:
                skipped.append(outcome.skipped)
            if outcome.entry is not None:
                documents.append(outcome.entry)
    finally:
        if verify_with is not None:
            # Registered for this run only, so a later one is not surprised by it.
            register_vision_model(None)

    finished_at = dt.datetime.now().astimezone()
    run = RunMetadata(
        tool_version=__version__,
        schema_version=SCHEMA_VERSION,
        started_at=started_at.isoformat(timespec="seconds"),
        finished_at=finished_at.isoformat(timespec="seconds"),
        duration_seconds=round(time.monotonic() - started, 3),
        target=str(target),
        components_run=requested,
        config_dir=config.source_dir,
        config_digest=config.digest,
        offline_guard=offline.guard_status(),
        # Every process that scored anything, not only this one.
        content_sent_to=sorted(
            {*_CLASSIFIER_HOSTS, *_hosts_sent_content(), *verification_hosts(documents)}
        ),
        classifier_missed_workers=_classifier_missed(classifier_spec, jobs, len(files), recovered),
        classifier_calls=_CLASSIFIER_TOTALS[0],
        classifier_failures=_CLASSIFIER_TOTALS[1],
        reveal_used=reveal,
        page_images_used=page_images,
        extracted_text_used=extracted_text,
        ocr_compare_used=ocr_compare,
        ocr_requested=ocr,
        ocr_available=ocr_module.available(),
        ner_available=ner_available(config) if "sensitive" in requested else False,
        python_version=platform.python_version(),
        monthly_volume=monthly_volume,
        jobs=jobs,
        timeout_seconds=timeout,
        sampled_from=found if sampled else None,
        sample_size=len(files) if sampled else None,
        password_used=bool(password),
        extractor=chosen_extractor,
        compare_extractors=list(compare_extractors),
        compare_engines=list(compare_engines),
        documents_read_after_worker_failure=recovered,
        verify_model=verify_name,
        verify_scope=verify_scope if verify_name is not None else None,
    )

    return assemble_report(
        config,
        requested,
        documents,
        skipped,
        run,
        resolution=resolution,
        monthly_volume=monthly_volume,
    )


def assemble_report(
    config: Config,
    requested: Sequence[str],
    documents: list[DocumentReport],
    skipped: list[SkipRecord],
    run: RunMetadata,
    *,
    resolution: str = "medium",
    monthly_volume: int | None = None,
) -> AuditReport:
    """The report around a finished set of entries: totals, limitations, scores.

    Shared by a folder audit and by an inspection of a loader's output, so the
    two cannot drift into different ideas of what a report contains.
    """
    folder_cost = None
    if "cost" in requested:
        folder_cost = folder_from_estimates(
            [e.cost for e in documents if e.cost is not None],
            config.pricing,
            headline_resolution=resolution,
            monthly_volume=monthly_volume,
        )

    staleness = check_staleness(config.pricing) if "cost" in requested else []
    report = AuditReport(
        run=run,
        documents=documents,
        skipped=skipped,
        cost=folder_cost,
        aggregate=build_aggregate(documents, skipped, folder_cost),
        staleness_warnings=[w.message for w in staleness],
        config_masking=config.sensitive.masking,
    )
    if "readiness" in requested and config.readiness.scoring.enabled:
        report.signal_weights = {
            sid: settings.weight
            for sid, settings in config.readiness.signals.items()
            if settings.enabled
        }
    report.limitations = build_limitations(run, documents, skipped, staleness, config)
    report.verification = summarise_verification(
        documents, config.readiness.routing.verify_min_coverage_pct / 100
    )
    # Computed from the finished report so both the JSON and HTML carry them.
    report.overall = overall_readiness(report, config.readiness.overall)
    report.quick_wins = quick_wins(report)
    report.routing = summarise_routes(report, config.pricing)
    return report


def vision_setup(
    verify_with: str | VisionModel | None, scope: str
) -> tuple[str | None, str | None]:
    """Register the vision model for this run, and return its spec and its reading name.

    The spec is None for a model passed as an object. Both are None when the
    run verifies nothing.
    """
    if verify_with is None:
        return None, None
    if scope not in VERIFY_SCOPES:
        raise ValueError(f"verify_scope must be one of {', '.join(VERIFY_SCOPES)}, not {scope!r}")
    if isinstance(verify_with, str):
        model = resolve_vision(verify_with)
        register_vision_model(model)
        return verify_with, f"vision:{model_name(model)}"
    if not callable(verify_with):
        raise TypeError(
            f"verify_with takes a vision model or a 'vision:module:function' spec, "
            f"not {type(verify_with).__name__}"
        )
    register_vision_model(verify_with)
    return None, f"vision:{model_name(verify_with)}"


def verification_hosts(documents: list[DocumentReport]) -> list[str]:
    """Every host a vision model sent a page to, across documents, in order first seen."""
    hosts: list[str] = []
    for document in documents:
        for host in document.verification.sent_to if document.verification else []:
            if host not in hosts:
                hosts.append(host)
    return hosts
