"""Generate the limitations section from what happened during the run.

Assembled from the run's own facts: which pages could not be read, which
detectors were unavailable, which signals did not apply, which prices are
unverified.
"""

from __future__ import annotations

from collections import defaultdict

from complydoc.config.loader import StalenessWarning
from complydoc.config.schema import Config
from complydoc.ingest.base import TIMED_OUT, SkipRecord
from complydoc.readiness.base import SignalStatus
from complydoc.report.models import DocumentReport, Limitation, RunMetadata
from complydoc.utils.text import count, plural

__all__ = ["build_limitations"]


def _sampling(run: RunMetadata) -> list[Limitation]:
    """Only part of the folder was looked at."""
    limitations: list[Limitation] = []

    if run.sampled_from is not None:
        limitations.append(
            Limitation(
                area="Sampling",
                statement=(
                    f"--sample limited this run to {run.sample_size} of the {run.sampled_from} "
                    f"documents found. Every total and monthly figure describes that sample. "
                    f"The sample keeps each file type's share of the folder and is "
                    f"chosen the same way every time, so two runs of this folder compare."
                ),
                severity="important",
            )
        )

    return limitations


def _content_sent_off_machine(run: RunMetadata) -> list[Limitation]:
    """Document text was sent somewhere."""
    limitations: list[Limitation] = []

    if run.content_sent_to:
        limitations.append(
            Limitation(
                area="Content sent off this machine",
                statement=(
                    f"Text from these documents was sent to "
                    f"{', '.join(sorted(run.content_sent_to))}. A classifier registered "
                    f"against a hosted service read the passages it judged, so the "
                    f"guarantee that nothing leaves this machine does not hold for this "
                    f"run. Everything else in it stayed here."
                ),
                severity="important",
            )
        )

    return limitations


def _classifier_failures(run: RunMetadata) -> list[Limitation]:
    """A classifier was asked and could not answer."""
    limitations: list[Limitation] = []

    if run.classifier_failures:
        every = run.classifier_failures == run.classifier_calls
        limitations.append(
            Limitation(
                area="Classifier calls that failed",
                statement=(
                    f"{count(run.classifier_failures, 'call')} to the registered classifier "
                    f"of {run.classifier_calls} failed, and a call that fails produces no "
                    f"score and so no finding. "
                    + (
                        "Every call failed, so nothing in this run was judged by it and the "
                        "passages it would have found are missing rather than absent."
                        if every
                        else "Passages those calls covered were judged by the patterns alone."
                    )
                ),
                severity="important",
            )
        )

    return limitations


def _classifier_and_workers(run: RunMetadata) -> list[Limitation]:
    """A classifier could not reach the worker processes."""
    limitations: list[Limitation] = []

    if run.classifier_missed_workers:
        limitations.append(
            Limitation(
                area="Classifier and worker processes",
                statement=(
                    f"A classifier was registered, and "
                    f"{count(run.classifier_missed_workers, 'document')} were read in "
                    f"worker processes where it does not exist, so it did not run for "
                    f"them. Findings from patterns are unaffected. Run with jobs=1 to put "
                    f"every document in reach of it."
                ),
                severity="important",
            )
        )

    return limitations


def _worker_restarts(run: RunMetadata) -> list[Limitation]:
    """A worker process stopped and its documents were read again here."""
    limitations: list[Limitation] = []

    if run.documents_read_after_worker_failure:
        limitations.append(
            Limitation(
                area="Parallel workers",
                statement=(
                    f"A worker process stopped during the run, so "
                    f"{count(run.documents_read_after_worker_failure, 'document')} were read "
                    f"again in the main process. Every document is in the report; the timings "
                    f"for those documents come from a single process."
                ),
                severity="info",
            )
        )

    return limitations


def _extractor_disagreement(documents: list[DocumentReport]) -> list[Limitation]:
    """Extractors that read the same page differently."""
    limitations: list[Limitation] = []

    differing = sorted(d.relative_path for d in documents if d.extractors_disagree)
    if differing:
        names = ", ".join(r.extractor for r in documents[0].extractions) if documents else ""
        limitations.append(
            Limitation(
                area="Extraction",
                statement=(
                    f"The extractors this run compared ({names}) read "
                    f"{count(len(differing), 'document')} differently. The findings come from the "
                    f"first of them, so what the others read is not reflected anywhere but "
                    f"here. On those documents the choice of extractor affects the findings."
                ),
                affected=differing,
                severity="important",
            )
        )

    return limitations


def _hidden_content(run: RunMetadata, documents: list[DocumentReport]) -> list[Limitation]:
    """Hidden text, and text addressed to a model."""
    limitations: list[Limitation] = []

    if "sensitive" in run.components_run:
        high = [
            d.relative_path
            for d in documents
            if any(f.severity == "high" for f in d.content_findings)
        ]
        passages = sum(1 for d in documents for f in d.content_findings if f.severity == "high")
        if high:
            limitations.append(
                Limitation(
                    area="Hidden content",
                    statement=(
                        f"{count(passages, 'passage')} in {count(len(high), 'document')} read as "
                        f"instructions to a model and are hidden from a person reading the "
                        f"document. A model given this text reads them."
                    ),
                    affected=high,
                    severity="important",
                )
            )
        hidden_only = [
            d.relative_path
            for d in documents
            if d.relative_path not in high
            and any(f.visibility in ("suspected", "confirmed") for f in d.content_findings)
        ]
        if hidden_only:
            limitations.append(
                Limitation(
                    area="Hidden content",
                    statement=(
                        f"{count(len(hidden_only), 'document')} contain text a reader does not "
                        f"see and a model given the extracted text does."
                    ),
                    affected=hidden_only,
                    severity="important",
                )
            )
        unchecked = [d for d in documents if d.visibility_checked is False]
        if unchecked:
            reasons = sorted({d.visibility_note for d in unchecked if d.visibility_note})
            limitations.append(
                Limitation(
                    area="Hidden content",
                    statement=(
                        f"Hidden text was not checked in {count(len(unchecked), 'document')}"
                        + (f": {'; '.join(reasons)}." if reasons else ".")
                        + " Instruction-like text in them is reported as not measured."
                    ),
                    affected=[d.relative_path for d in unchecked],
                    severity="info",
                )
            )
        if documents:
            limitations.append(
                Limitation(
                    area="Hidden content",
                    statement=(
                        "Hidden-text checks cover the text layer of PDFs and the markup of "
                        "Word, Excel, PowerPoint, HTML, Markdown and email files. In HTML and "
                        "Markdown, hidden passages are reported only when they read as "
                        "instructions. Text inside images, which a vision model reads, is not "
                        "checked. Instruction patterns cover English and six other European "
                        "languages; wording outside those is found only by a classifier."
                    ),
                    severity="info",
                )
            )

    return limitations


def _imported_prices(documents: list[DocumentReport]) -> list[Limitation]:
    """Prices taken from a third-party table rather than the provider."""
    limitations: list[Limitation] = []

    priced = next((d.cost.models for d in documents if d.cost), [])
    imported = sorted({m.display_name for m in priced if m.price_source == "imported"})
    if imported:
        taken = next((m.imported_on for m in priced if m.imported_on), None)
        limitations.append(
            Limitation(
                area="Price provenance",
                statement=(
                    f"{count(len(imported), 'model')} "
                    f"{'is' if len(imported) == 1 else 'are'} priced from a maintained "
                    f"third-party table{f' taken on {taken.isoformat()}' if taken else ''}. "
                    f"{'That price has' if len(imported) == 1 else 'Those prices have'} not been "
                    f"checked against the provider's own page."
                ),
                affected=imported,
                # A caveat on a cost estimate, not on what the documents hold: it
                # sat among the important limitations of every run, beside unread
                # pages and unscanned categories, and drowned them out.
                severity="info",
            )
        )

    return limitations


def _files_not_examined(run: RunMetadata, skipped: list[SkipRecord]) -> list[Limitation]:
    """Files that were never opened."""
    limitations: list[Limitation] = []

    if skipped:
        by_reason: dict[str, list[str]] = defaultdict(list)
        for record in skipped:
            by_reason[record.reason].append(record.path.name)
        for reason, files in sorted(by_reason.items()):
            if reason == TIMED_OUT:
                # These opened; they were stopped part way, which is a different fact.
                limit = f"{run.timeout_seconds:g}s" if run.timeout_seconds else "the time limit"
                statement = (
                    f"{count(len(files), 'file')} were still being read after {limit} and were "
                    f"stopped. Nothing in this report says anything about them."
                )
            else:
                statement = (
                    f"{count(len(files), 'file')} were not examined because they could not be "
                    f"opened ({reason}). Nothing in this report says anything about them."
                )
            limitations.append(
                Limitation(
                    area="Files not examined",
                    statement=statement,
                    affected=sorted(files),
                    severity="important",
                )
            )

    return limitations


def _unreadable_pages(run: RunMetadata, documents: list[DocumentReport]) -> list[Limitation]:
    """Pages with no readable text."""
    limitations: list[Limitation] = []

    unreadable: dict[str, list[int]] = {}
    for document in documents:
        if document.sensitive and document.sensitive.unreadable_pages:
            unreadable[document.relative_path] = document.sensitive.unreadable_pages
    if unreadable:
        total = sum(len(v) for v in unreadable.values())
        if run.ocr_requested and not run.ocr_available:
            why = "OCR was requested but the optional OCR extra is not installed"
        elif not run.ocr_requested:
            why = "OCR was not requested (pass --ocr to read scanned pages)"
        else:
            why = "OCR ran but recognised no text on them"
        limitations.append(
            Limitation(
                area="Pages that could not be read",
                statement=(
                    f"{count(total, 'page')} carried no readable text because {why}. Those pages "
                    f"were not searched for sensitive information."
                ),
                affected=[
                    f"{path}: {plural(len(pages), 'page')} {', '.join(map(str, pages))}"
                    for path, pages in sorted(unreadable.items())
                ],
                severity="important",
            )
        )

    return limitations


def _encrypted_documents(documents: list[DocumentReport]) -> list[Limitation]:
    """Documents that are password protected."""
    limitations: list[Limitation] = []

    encrypted = [
        d.relative_path
        for d in documents
        if any("password protected" in w for w in d.load_warnings)
    ]
    if encrypted:
        limitations.append(
            Limitation(
                area="Encrypted documents",
                statement=(
                    f"{count(len(encrypted), 'document')} are password protected and could not be "
                    f"opened, so nothing was measured for them beyond the fact of encryption."
                ),
                affected=sorted(encrypted),
                severity="important",
            )
        )

    return limitations


def _categories_not_scanned(documents: list[DocumentReport], config: Config) -> list[Limitation]:
    """Detector categories that never ran."""
    limitations: list[Limitation] = []

    unscanned: dict[str, tuple[str, list[str]]] = {}
    for document in documents:
        if not document.sensitive:
            continue
        for entry in document.sensitive.unscanned_categories:
            label, affected = unscanned.setdefault(entry.category, (entry.reason, []))
            affected.append(document.relative_path)
    # Categories held back for the same reason are one limitation, not one each:
    # a missing name model skips people and organisations together, and listing
    # the same cause twice read as two separate problems.
    same_cause: dict[tuple[str, tuple[str, ...]], list[str]] = {}
    for category, (reason, affected) in sorted(unscanned.items()):
        label = (
            config.sensitive.categories[category].label
            if category in config.sensitive.categories
            else category
        )
        same_cause.setdefault((reason, tuple(sorted(set(affected)))), []).append(label)
    for (reason, affected_docs), labels in same_cause.items():
        names = " and ".join([", ".join(labels[:-1]), labels[-1]] if len(labels) > 1 else labels)
        limitations.append(
            Limitation(
                area="Categories not scanned",
                statement=(
                    f"{names} {'were' if len(labels) > 1 else 'was'} not scanned for at all, "
                    f"because {reason}. No conclusion about "
                    f"{'these categories' if len(labels) > 1 else 'this category'} can be "
                    f"drawn from this report."
                ),
                affected=list(affected_docs),
                severity="important",
            )
        )

    return limitations


def _failed_signals(documents: list[DocumentReport]) -> list[Limitation]:
    """Signals that raised an error."""
    limitations: list[Limitation] = []

    # Keyed by (signal, reason). Grouping on the signal alone would attach one
    # document's reason to every other document in the group.
    #
    # Only signals that errored: one that does not apply to a format is a
    # property of the document, and the document itself lists it.
    error_signals: dict[tuple[str, str], list[str]] = {}
    for document in documents:
        if not document.readiness:
            continue
        for signal in document.readiness.signals:
            if signal.status is not SignalStatus.ERROR:
                continue
            key = (signal.name, signal.reason or "no reason recorded")
            error_signals.setdefault(key, []).append(document.relative_path)

    for (name, reason), affected in sorted(error_signals.items()):
        limitations.append(
            Limitation(
                area="Signals that failed",
                statement=(
                    f'"{name}" raised an error on {count(len(set(affected)), "document")} and was '
                    f"skipped: {reason}. This is a defect in complydoc."
                ),
                affected=sorted(set(affected)),
                severity="important",
            )
        )

    return limitations


def _aligned_tables(documents: list[DocumentReport]) -> list[Limitation]:
    """What alignment-detected tables cannot report."""
    limitations: list[Limitation] = []

    aligned = [
        d.relative_path
        for d in documents
        if d.readiness
        and any(
            s.id == "table_count"
            and s.status is SignalStatus.MEASURED
            and s.detail.get("aligned_tables")
            for s in d.readiness.signals
        )
    ]
    if aligned:
        limitations.append(
            Limitation(
                area="Table detection",
                statement=(
                    f"{count(len(aligned), 'document')} contain tables aligned by "
                    f"whitespace with no ruling lines. They are counted; header depth and "
                    f"merged cells are not measured for them."
                ),
                affected=sorted(aligned),
            )
        )

    return limitations


def _documents_without_pagination(documents: list[DocumentReport]) -> list[Limitation]:
    """Documents with no fixed pagination."""
    limitations: list[Limitation] = []

    unpaged = [d.relative_path for d in documents if not d.page_count_known]
    if unpaged:
        limitations.append(
            Limitation(
                area="Page counts",
                statement=(
                    f"{count(len(unpaged), 'document')} have no fixed pagination until they are "
                    f"rendered, so their page count, page dimensions and any per-page cost "
                    f"figure are not measurements. Vision-path costs are reported as not "
                    f"applicable for them."
                ),
                affected=sorted(unpaged),
            )
        )

    return limitations


def _price_provenance(staleness: list[StalenessWarning], config: Config) -> list[Limitation]:
    """Prices that are stale, and models carrying no price at all."""
    limitations: list[Limitation] = []

    for warning in staleness:
        limitations.append(
            Limitation(
                area="Price provenance",
                statement=warning.message,
                severity="important",
            )
        )

    disabled = [m.id for m in config.pricing.models if not m.enabled]
    if disabled:
        limitations.append(
            Limitation(
                area="Models not costed",
                statement=(
                    f"{len(disabled)} model entr(y/ies) in pricing.yaml carry no price and "
                    f"are switched off, so no cost was computed for them. complydoc does not "
                    f"invent prices; fill them in and set last_verified to include them."
                ),
                affected=sorted(disabled),
            )
        )

    return limitations


def _token_counting(documents: list[DocumentReport]) -> list[Limitation]:
    """Where a token count is an estimate rather than a count."""
    limitations: list[Limitation] = []

    fidelities: dict[str, list[str]] = defaultdict(list)
    for document in documents:
        if not document.cost:
            continue
        for model in document.cost.models:
            if model.text_token_fidelity != "exact" and model.text_token_note:
                fidelities[model.text_token_note].append(model.display_name)
    for note, models in fidelities.items():
        limitations.append(
            Limitation(
                area="Token counting",
                statement=note,
                affected=sorted(set(models)),
            )
        )

    return limitations


def _cost_scope(run: RunMetadata, config: Config) -> list[Limitation]:
    """What a cost figure does not cover."""
    limitations: list[Limitation] = []

    if run.components_run and "cost" in run.components_run:
        limitations.append(
            Limitation(
                area="Cost scope",
                statement=(
                    "Only input cost is estimated. Output cost depends on the prompt, so "
                    "the real bill will be higher."
                ),
            )
        )
        if config.pricing.currency.report_in.upper() == "USD":
            limitations.append(
                Limitation(
                    area="Currency",
                    statement=(
                        "Costs are shown in US dollars, the currency the providers publish "
                        "in. No verified exchange rate is configured, so no conversion to "
                        "sterling was applied."
                    ),
                )
            )

    return limitations


def _volume_extrapolation(run: RunMetadata, documents: list[DocumentReport]) -> list[Limitation]:
    """Monthly and annual figures rest on this run being typical."""
    limitations: list[Limitation] = []

    if run.monthly_volume:
        limitations.append(
            Limitation(
                area="Volume extrapolation",
                statement=(
                    f"Monthly and annual figures assume the {count(len(documents), 'document')} "
                    f"audited here are representative of the {run.monthly_volume:,} you "
                    f"process each month. If this sample is unusual, so is the projection."
                ),
                severity="important",
            )
        )

    return limitations


def _masking(run: RunMetadata) -> list[Limitation]:
    """Reports that carry values in the clear."""
    limitations: list[Limitation] = []

    if run.reveal_used:
        limitations.append(
            Limitation(
                area="Masking",
                statement=(
                    "This report was generated with --reveal, so it contains unmasked "
                    "sensitive values. Treat this file with the same care as the documents "
                    "it describes."
                ),
                severity="important",
            )
        )

    if run.page_images_used and not run.reveal_used:
        limitations.append(
            Limitation(
                area="Masking",
                statement=(
                    "This report embeds a picture of each page, and a picture shows every "
                    "value on the page unmasked. The findings and the text are masked; the "
                    "pictures are not. Treat this file with the same care as the documents "
                    "it describes."
                ),
                severity="important",
            )
        )

    return limitations


def _unconfigured_signals(documents: list[DocumentReport]) -> list[Limitation]:
    """Signals registered in code with no entry in the configuration."""
    limitations: list[Limitation] = []

    unconfigured: set[str] = set()
    for document in documents:
        if document.readiness:
            unconfigured |= set(document.readiness.unconfigured_signals)
    if unconfigured:
        limitations.append(
            Limitation(
                area="Configuration",
                statement=(
                    "These signals are registered in code but have no entry in "
                    "readiness.yaml, so they were measured without a rating or a weight."
                ),
                affected=sorted(unconfigured),
            )
        )

    return limitations


def _components_not_run(run: RunMetadata) -> list[Limitation]:
    """Components this run did not cover."""
    limitations: list[Limitation] = []

    all_components = {"cost", "readiness", "sensitive"}
    not_run = sorted(all_components - set(run.components_run))
    if not_run:
        limitations.append(
            Limitation(
                area="Components not run",
                statement=(
                    f"This run covered only {', '.join(sorted(run.components_run))}. "
                    f"Nothing here says anything about {', '.join(not_run)}."
                ),
                severity="important",
            )
        )

    return limitations


def build_limitations(
    run: RunMetadata,
    documents: list[DocumentReport],
    skipped: list[SkipRecord],
    staleness: list[StalenessWarning],
    config: Config,
) -> list[Limitation]:
    """Every limitation this run carries, in the order the report shows them."""
    return [
        *_sampling(run),
        *_content_sent_off_machine(run),
        *_classifier_failures(run),
        *_classifier_and_workers(run),
        *_worker_restarts(run),
        *_extractor_disagreement(documents),
        *_hidden_content(run, documents),
        *_imported_prices(documents),
        *_files_not_examined(run, skipped),
        *_unreadable_pages(run, documents),
        *_encrypted_documents(documents),
        *_categories_not_scanned(documents, config),
        *_failed_signals(documents),
        *_aligned_tables(documents),
        *_documents_without_pagination(documents),
        *_price_provenance(staleness, config),
        *_token_counting(documents),
        *_cost_scope(run, config),
        *_volume_extrapolation(run, documents),
        *_masking(run),
        *_unconfigured_signals(documents),
        *_components_not_run(run),
    ]
