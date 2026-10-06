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

import datetime as dt
import platform
import time
from collections import Counter
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

from complydoc import __version__, offline
from complydoc.audit.discovery import discover
from complydoc.audit.entry import (
    Work,
    ner_available,
)
from complydoc.audit.pool import (
    _CLASSIFIER_HOSTS,
    _CLASSIFIER_TOTALS,
    _hosts_sent_content,
    _outcomes,
    resolve_jobs,
)
from complydoc.audit.sampling import sample_files
from complydoc.categories import (
    CategoriesApplied,
    find_categories_file,
    load_categories,
    with_categories,
)
from complydoc.concepts import (
    Concept,
    ConceptFile,
    ConceptJudge,
    find_concepts_file,
    load_concepts,
    register_concept_judge,
    resolve_concept_judge,
    with_concepts,
)
from complydoc.config.loader import check_staleness
from complydoc.config.schema import Config
from complydoc.cost.estimator import folder_from_estimates, resolve_models
from complydoc.hidden.instructions import (
    register_instruction_classifier,
    resolve_classifier,
)
from complydoc.ignores import IgnoreFile, apply_ignores, find_ignore_file, load_ignores
from complydoc.ingest import ocr as ocr_module
from complydoc.ingest.base import (
    IngestOptions,
    SkipRecord,
)
from complydoc.ingest.extractors.registry import DEFAULT_EXTRACTOR
from complydoc.report.limitations import (
    build_limitations,
    category_limitations,
    concept_limitations,
    ignore_limitations,
)
from complydoc.report.models import (
    SCHEMA_VERSION,
    AuditReport,
    CategoryChangeRecord,
    CategorySummary,
    ConceptRule,
    ConceptSummary,
    DocumentReport,
    RunMetadata,
    build_aggregate,
)
from complydoc.report.overall import overall_readiness
from complydoc.report.quickwins import quick_wins
from complydoc.report.routing import summarise_routes
from complydoc.report.verification import summarise_verification
from complydoc.verification.vision import (
    VERIFY_SCOPES,
    VisionModel,
    model_name,
    register_vision_model,
    resolve_vision,
)

__all__ = ["COMPONENTS", "resolve_jobs", "run_audit"]

COMPONENTS: tuple[str, ...] = ("cost", "readiness", "sensitive")


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
    concepts: tuple[Concept, ...] = (),
    concept_judge: str | None = None,
    judging: bool = False,
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
        concepts=concepts,
        concept_judge=concept_judge,
        judging=judging,
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
    ignore_file: Path | None = None,
    categories_file: Path | None = None,
    concepts_file: Path | None = None,
    judge_concepts: str | ConceptJudge | None = None,
) -> AuditReport:
    """Audit `target` and assemble the report.

    `ignore_file` names findings to set aside (see `complydoc.ignores`). Without
    it, `.complydoc-ignore.yaml` at the top of `target` is read when it exists.
    `categories_file` names identifier categories to switch off or re-grade (see
    `complydoc.categories`), read the same way from `.complydoc-categories.yaml` without it.
    `concepts_file` names your own things to look for (see `complydoc.concepts`),
    read the same way from `.complydoc-concepts.yaml` without it.
    `judge_concepts` puts the concepts marked `judge` to a judgement model, page
    by page: `jev`, which each worker builds and which sends page text to
    TypeSafe, or a judge of your own, which keeps the run in this process.

    `verify_with` reads pages again with a vision model: a `vision:module:function`
    spec, which crosses into worker processes, or a model object, which keeps the
    run in this process. `verify_scope` is `flagged` or `all`.
    """
    started = time.monotonic()
    started_at = dt.datetime.now().astimezone()
    # Read before any document is, so a broken file stops the run at once.
    ignore_path = ignore_file or find_ignore_file(target)
    ignores = (ignore_path, load_ignores(ignore_path)) if ignore_path is not None else None
    categories_path = categories_file or find_categories_file(target)
    categories = None
    if categories_path is not None:
        shipped = config
        config, applied = with_categories(config, load_categories(categories_path))
        categories = summarise_categories(categories_path, shipped, config, applied)
    concepts_path = concepts_file or find_concepts_file(target)
    concepts = (concepts_path, load_concepts(concepts_path)) if concepts_path is not None else None
    if concepts is not None:
        config = with_concepts(config, concepts[1])
    # Resolved before any document is read, so a missing key stops the run at once.
    judge_spec = judge_concepts if isinstance(judge_concepts, str) else None
    judging = judge_concepts is not None
    if judging:
        register_concept_judge(
            resolve_concept_judge(judge_concepts)
            if isinstance(judge_concepts, str)
            else judge_concepts
        )
        if judge_spec is None:
            # A judge of the caller's is a function here, which cannot cross into a worker.
            jobs, timeout = 1, None
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
        concepts=tuple(concepts[1].concepts) if concepts is not None else (),
        concept_judge=judge_spec,
        judging=judging,
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
        if judging:
            register_concept_judge(None)

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
        ignores=ignores,
        concepts=concepts,
        categories=categories,
        judge_name=(
            None if not judging else judge_spec or getattr(judge_concepts, "__name__", "your own")
        ),
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
    ignores: tuple[Path, IgnoreFile] | None = None,
    concepts: tuple[Path, ConceptFile] | None = None,
    categories: CategorySummary | None = None,
    judge_name: str | None = None,
) -> AuditReport:
    """The report around a finished set of entries: totals, limitations, scores.

    `ignores` sets findings aside first, so they leave everything counted after.

    Shared by a folder audit and by an inspection of a loader's output, so the
    two cannot drift into different ideas of what a report contains.
    """
    ignore_summary = (
        apply_ignores(documents, ignores[0], ignores[1], dt.date.today())
        if ignores is not None
        else None
    )
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
        ignores=ignore_summary,
        concepts=(
            summarise_concepts(documents, concepts, judge_name) if concepts is not None else None
        ),
        categories=categories,
    )
    if "readiness" in requested and config.readiness.scoring.enabled:
        report.signal_weights = {
            sid: settings.weight
            for sid, settings in config.readiness.signals.items()
            if settings.enabled
        }
    report.limitations = build_limitations(run, documents, skipped, staleness, config)
    report.limitations += concept_limitations(report.concepts)
    report.limitations += category_limitations(report.categories)
    report.limitations += ignore_limitations(
        ignore_summary, report.aggregate.ignored_total if report.aggregate else 0
    )
    report.verification = summarise_verification(
        documents, config.readiness.routing.verify_min_coverage_pct / 100
    )
    # Computed from the finished report so both the JSON and HTML carry them.
    report.overall = overall_readiness(report, config.readiness.overall)
    report.quick_wins = quick_wins(report)
    report.routing = summarise_routes(report, config.pricing)
    return report


def summarise_categories(
    path: Path, shipped: Config, used: Config, applied: CategoriesApplied
) -> CategorySummary:
    """Each category this run looked for otherwise than as it ships."""
    changes = []
    for name in applied.changed:
        before = shipped.sensitive.categories[name]
        after = used.sensitive.categories[name]
        changes.append(
            CategoryChangeRecord(
                category=name,
                label=after.label,
                enabled=after.enabled and not after.silent,
                severity=after.severity,
                shipped_enabled=before.enabled,
                shipped_severity=before.severity,
            )
        )
    return CategorySummary(file=str(path), changes=changes, unknown=applied.unknown)


def summarise_concepts(
    documents: list[DocumentReport], concepts: tuple[Path, ConceptFile], judge: str | None = None
) -> ConceptSummary:
    """Each concept the run looked for, how often its pattern matched, ignored ones
    included, and on how many pages a judge said it was."""
    found: Counter[str] = Counter()
    judged: Counter[str] = Counter(f.concept for d in documents for f in d.concept_findings)
    for document in documents:
        for match in document.sensitive.matches if document.sensitive else []:
            found[match.category] += 1
        for ignored in document.ignored:
            if ignored.identifier is not None:
                found[ignored.identifier.category] += 1
    path, file = concepts
    return ConceptSummary(
        file=str(path),
        judge=judge,
        unjudged=sum(d.concepts_unjudged for d in documents),
        concepts=[
            ConceptRule(
                id=c.id,
                label=c.label,
                description=c.description,
                pattern=c.pattern,
                severity=c.severity,
                judge=c.judge,
                found=found[c.category],
                judged=judged[c.id],
            )
            for c in file.concepts
        ],
    )


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
