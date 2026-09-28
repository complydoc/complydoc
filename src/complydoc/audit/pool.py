"""Documents read one at a time, or spread over a process pool with `jobs` above one.

A document that takes longer than the timeout, or a worker that dies, is recorded as
skipped, and the documents a failed pool still held are read here after all.
"""

from __future__ import annotations

import dataclasses
import os
import re
import threading
import time
from collections import deque
from collections.abc import Callable, Iterator
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from multiprocessing import get_all_start_methods, get_context
from pathlib import Path
from typing import Any

from complydoc import offline
from complydoc.audit.entry import Work, build_entry
from complydoc.concepts import (
    register_concept_judge,
    resolve_concept_judge,
)
from complydoc.hidden.instructions import (
    classifier_calls,
    register_instruction_classifier,
    resolve_classifier,
)
from complydoc.ingest import ocr as ocr_module
from complydoc.ingest.base import (
    TIMED_OUT,
    LoaderError,
    SkipRecord,
)
from complydoc.ingest.registry import load_document
from complydoc.report.models import (
    DocumentReport,
)
from complydoc.sensitive.detectors.model_server import ModelServer, ServerAddress
from complydoc.sensitive.detectors.model_server import connect as connect_models
from complydoc.utils.files import relative_to_root
from complydoc.verification.vision import (
    register_vision_model,
    resolve_vision,
)


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


def _process(path: Path, work: Work) -> _Outcome:
    """Read one document and produce its report entry. Never raises."""
    ocr_before = ocr_module.stats()
    began = time.time()
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

    entry = build_entry(
        document, work, read_seconds, relative_to_root(document.path, work.target), began
    )
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


def _pool_context(work: Work) -> Any:
    """How to start the workers.

    Forkserver where it exists: the server process loads the tokenizer and the
    language identifier once, and every worker forks from it with those already
    in memory. Under spawn each worker loads its own copy, which on a folder of
    small documents costs more than the work itself.

    Never a plain fork of this process. The OCR engine holds native threads, and
    forking a process that has them is a known way to hang a child. The
    forkserver is a fresh interpreter, so it inherits none of that.

    A forked worker cannot use the GPU on a Mac: Metal cannot reach its shader
    compiler from a process that was forked without being started afresh, and
    the first kernel it has not compiled aborts the worker, which ends the pool
    as `BrokenProcessPool`. complydoc's own name model therefore never runs in a
    worker on the GPU (see `model_server`). Code of the caller's does run there,
    a classifier, a vision model or a concept judge, and may well use the GPU,
    so a run with any of those starts each worker afresh instead.
    """
    callers_code = work.classifier or work.verify_spec or work.concept_judge
    if not callers_code and "forkserver" in get_all_start_methods():
        context = get_context("forkserver")
        context.set_forkserver_preload(["complydoc.audit.warm"])
        return context
    return get_context("spawn")


def _name_model_warmer(work: Work) -> Callable[[], None] | None:
    """What loads the run's name models ahead of its first page; None if it needs none."""
    from complydoc.sensitive.detectors import token_classifier

    if "sensitive" not in work.requested:
        return None
    names = token_classifier.configured_models(work.config.sensitive)
    if not names:
        return None

    def warm() -> None:
        for name in names:
            token_classifier.model_available(name)

    return warm


def _warm_in_background(work: Work) -> None:
    """Load the name model on a thread while the first document is read.

    Loading it takes two to three seconds, most of a small folder's run; reading
    the first document takes about as long, and the two need not wait on each other.
    """
    warm = _name_model_warmer(work)
    if warm is not None:
        threading.Thread(target=warm, name="complydoc-warm", daemon=True).start()


@contextmanager
def _served_models(work: Work) -> Iterator[ServerAddress | None]:
    """Serve this process's name model to the workers, where the run reads names with one.

    The model is loaded while the workers start and read, not before: loading it
    first held every worker back by the two seconds it takes.
    """
    from complydoc.sensitive.detectors import token_classifier

    warm = _name_model_warmer(work)
    if warm is None:
        yield None
        return
    server = ModelServer(token_classifier.classify_windows, warm)
    try:
        yield server.address
    finally:
        server.close()


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


def _worker_init(work: Work, models: ServerAddress | None, ocr_threads: int) -> None:
    """Set up a worker process. The network guard is armed here too.

    A guard that only holds in the parent would be no guard at all, so every
    process that opens a document arms it before it opens anything.

    The cores are shared out between the workers: OCR is given its share, and
    the other native thread pools one thread each. OCR otherwise spreads one page
    across every core, so the workers would spend their time fighting each other
    for the same cores. Pinning it to one thread wastes them instead when there
    are fewer workers than cores: two workers on eleven cores read a page in
    4.3s each, against 1.2s with five threads apiece. It has to happen before
    the OCR engine is built.
    """
    global _WORKER_WORK
    for variable in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
        os.environ.setdefault(variable, "1")
    ocr_module.set_threads(ocr_threads)
    offline.arm()
    if models is not None:
        from complydoc.sensitive.detectors import token_classifier

        # A worker that cannot reach the audit's model loads its own, on the CPU.
        with suppress(OSError):
            token_classifier.use_server(connect_models(models))
    if work.classifier is not None:
        # After the guard, and after the fork rather than in the preload: a
        # classifier of the caller's may load a model, and `warm` is explicit
        # that a process which has done that is not safe to fork from.
        register_instruction_classifier(resolve_classifier(work.classifier))
    if work.verify_spec is not None:
        register_vision_model(resolve_vision(work.verify_spec))
    if work.concept_judge is not None:
        register_concept_judge(resolve_concept_judge(work.concept_judge))
    _WORKER_WORK = work


def _worker(path: Path) -> _Outcome:
    assert _WORKER_WORK is not None
    return _process(path, _WORKER_WORK)


def _process_pool(jobs: int, work: Work, models: ServerAddress | None) -> ProcessPoolExecutor:
    return ProcessPoolExecutor(
        max_workers=jobs,
        mp_context=_pool_context(work),
        initializer=_worker_init,
        initargs=(work, models, max(1, (os.cpu_count() or 1) // jobs)),
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


def _timed(
    files: list[Path], work: Work, jobs: int, timeout: float, models: ServerAddress | None
) -> Iterator[_Outcome]:
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
    pool = _process_pool(jobs, work, models)
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
                pool = _process_pool(jobs, work, models)
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
        with _served_models(work) as models:
            yield from _timed(files, work, max(1, jobs), timeout, models)
        return
    if jobs <= 1 or len(files) < 2:
        _warm_in_background(work)
        for path in files:
            outcome = _process(path, work)
            _count_classifier(outcome)
            yield outcome
        return

    returned = 0
    try:
        with _served_models(work) as models, _process_pool(jobs, work, models) as pool:
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


_DOCUMENTS_PER_WORKER = 3
"""A worker for every this many documents, up to `_max_workers()`.

A worker no longer loads the name model, so starting one costs little: on six
documents two workers took 6.4s against 8.8s for one, and on three they cost
nothing.
"""


def _max_workers() -> int:
    """Half the cores. Past that, the workers wait on the one name model and on each other's OCR.

    Measured on 96 mixed documents on eleven cores: two workers 16.1s, five 13.8s,
    eight 14.8s, eleven 15.6s. With `--ocr-compare` on 24, four took 44s and eight 62s.
    """
    return max(1, (os.cpu_count() or 1) // 2)


def resolve_jobs(jobs: int, files: int) -> int:
    """How many processes to use. 0 decides from the size of the folder."""
    if jobs == 0:
        jobs = min(_max_workers(), -(-files // _DOCUMENTS_PER_WORKER))
    return max(1, min(jobs, max(1, files)))
