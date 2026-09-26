"""Generate the limitations section from what happened during the run.

Assembled from the run's own facts: which pages could not be read, which
detectors were unavailable, which signals did not apply, which prices are
unverified.
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from complydoc.config.loader import StalenessWarning
from complydoc.config.schema import Config
from complydoc.ingest.base import TIMED_OUT, SkipRecord
from complydoc.readiness.base import SignalStatus
from complydoc.report.models import (
    ConceptSummary,
    DocumentReport,
    IgnoreSummary,
    Limitation,
    RunMetadata,
)
from complydoc.utils.text import count, plural

__all__ = ["build_limitations", "concept_limitations", "ignore_limitations"]


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
        what = (
            "Page images or text from these documents were sent to"
            if run.verify_model
            else "Text from these documents was sent to"
        )
        who = (
            "A vision model or classifier registered against a hosted service read "
            "what it was given"
            if run.verify_model
            else "A classifier registered against a hosted service read the passages it judged"
        )
        limitations.append(
            Limitation(
                area="Content sent off this machine",
                statement=(
                    f"{what} {', '.join(sorted(run.content_sent_to))}. {who}, so the "
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


def _pages_with(documents: list[DocumentReport], status: str) -> tuple[int, list[str]]:
    """How many verified pages have `status`, and in which documents."""
    total = 0
    affected: list[str] = []
    for document in documents:
        if document.verification is None:
            continue
        found = document.verification.count(status)
        if found:
            total += found
            affected.append(document.relative_path)
    return total, affected


def _verification(run: RunMetadata, documents: list[DocumentReport]) -> list[Limitation]:
    """What a vision read of the pages covered, and what it could not settle."""
    limitations: list[Limitation] = []
    verified = [d for d in documents if d.verification is not None]
    if run.verify_model is None or not verified:
        return limitations
    model = run.verify_model

    disagree, affected = _pages_with(verified, "disagrees")
    if disagree:
        limitations.append(
            Limitation(
                area="Pages a vision model read differently",
                statement=(
                    f"{model} read words on {count(disagree, 'page')} that the kept reading "
                    f"does not have. Every finding on those pages was made from the kept "
                    f"reading, so what is missing from it was never scanned. The Documents "
                    f"page puts the two readings side by side."
                ),
                affected=affected,
                severity="important",
            )
        )

    filled, affected = _pages_with(verified, "filled")
    if filled:
        limitations.append(
            Limitation(
                area="Pages read only by a vision model",
                statement=(
                    f"{count(filled, 'page')} had no usable reading, so {model}'s reading "
                    f"became their text and was scanned. A vision model's transcription is "
                    f"a judgement, not a text layer: nothing checked it against another reader."
                ),
                affected=affected,
                severity="important",
            )
        )

    failed, affected = _pages_with(verified, "failed")
    if failed:
        limitations.append(
            Limitation(
                area="Vision calls that failed",
                statement=(
                    f"{model} raised on {count(failed, 'page')}, so those pages were not "
                    f"checked. They are missing from the comparison, not in agreement with it."
                ),
                affected=affected,
                severity="important",
            )
        )

    drawn, affected = _pages_with(verified, "not_rendered")
    if drawn:
        limitations.append(
            Limitation(
                area="Pages that could not be drawn",
                statement=(
                    f"{count(drawn, 'page')} could not be rendered as an image, so no vision "
                    f"model saw them. Only PDFs and image files on disk can be drawn."
                ),
                affected=affected,
            )
        )

    if run.verify_scope == "flagged":
        checked = sum(
            1
            for d in verified
            if d.verification
            for page in d.verification.pages
            if page.status != "not_rendered"
        )
        total = sum(d.verification.pages_total for d in verified if d.verification)
        if checked < total:
            limitations.append(
                Limitation(
                    area="Pages not read again",
                    statement=(
                        f"Only the pages routing flagged were read again: {checked} of "
                        f"{count(total, 'page')}. A page that measured fine and was read "
                        f"wrongly anyway was not checked. --verify-scope all reads every page."
                    ),
                )
            )

    unreadable = [
        f"{d.relative_path} p{number}"
        for d in verified
        if d.verification
        for number in d.verification.unreadable_pages
    ]
    if unreadable:
        limitations.append(
            Limitation(
                area="Pages with nothing on them to read",
                statement=(
                    f"{count(len(unreadable), 'page')} carried no text and no image, known "
                    f"before any model was called. Blank pages, or text drawn as vector "
                    f"shapes, which only a vision read recovers."
                ),
                affected=unreadable,
            )
        )

    unpriced = sorted(
        {
            page.cost.model or model
            for d in verified
            if d.verification
            for page in d.verification.pages
            if page.cost is not None and page.cost.basis == "unpriced"
        }
    )
    if unpriced:
        limitations.append(
            Limitation(
                area="Vision reads with no price",
                statement=(
                    f"No price is known for {', '.join(unpriced)}, so what the vision reads "
                    f"cost is not stated. Return usd or token counts from the model, or add "
                    f"it to pricing.yaml."
                ),
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
    """Where the prices come from, and as of when: said once, for every model."""
    limitations: list[Limitation] = []

    priced = next((d.cost.models for d in documents if d.cost), [])
    taken = next((m.imported_on for m in priced if m.imported_on), None)
    if taken is not None:
        limitations.append(
            Limitation(
                area="Price provenance",
                statement=(
                    f"Prices are as of {taken.isoformat()}, from the price table complydoc "
                    f"carries, refreshed each week from models.dev and litellm. A provider can "
                    f"change a price between refreshes."
                ),
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


def ignore_limitations(summary: IgnoreSummary | None, ignored: int) -> list[Limitation]:
    """What an ignore file set aside, and which of its entries no longer do anything.

    Said every time, because a count with findings taken out of it reads the
    same as a count without them.
    """
    if summary is None:
        return []
    name = Path(summary.file).name
    notes: list[Limitation] = []
    if ignored:
        notes.append(
            Limitation(
                area="Ignored findings",
                statement=(
                    f"{count(ignored, 'finding')} {plural(ignored, 'was', 'were')} set aside "
                    f"by {name}, each with a reason, and left out of every count and "
                    f"rule in this report. They are listed under each document's ignored "
                    f"findings."
                ),
            )
        )
    if summary.expired:
        notes.append(
            Limitation(
                area="Expired ignores",
                statement=(
                    f"{count(len(summary.expired), 'entry', 'entries')} in {name} passed "
                    f"{plural(len(summary.expired), 'its', 'their')} end date, so what "
                    f"{plural(len(summary.expired), 'it', 'they')} set aside is counted "
                    f"again. Look at it again, then renew or remove "
                    f"{plural(len(summary.expired), 'the entry', 'each entry')}."
                ),
                affected=[f"{rule.finding} (until {rule.until})" for rule in summary.expired],
                severity="important",
            )
        )
    if summary.unused:
        notes.append(
            Limitation(
                area="Ignores that matched nothing",
                statement=(
                    f"{count(len(summary.unused), 'entry', 'entries')} in {name} "
                    f"matched no finding in this run. The document may have changed, or the "
                    f"entry may belong to another folder."
                ),
                affected=[rule.what or rule.finding for rule in summary.unused],
            )
        )
    return notes


def concept_limitations(summary: ConceptSummary | None) -> list[Limitation]:
    """What a run could not say about your concepts.

    A concept meant for a judgement model on a run that asked none was found by
    its pattern alone, or, without one, not looked for at all; and a question
    the judge failed says nothing either way.
    """
    if summary is None:
        return []
    notes: list[Limitation] = []
    waiting = [c for c in summary.concepts if c.judge]
    if waiting and summary.judge is None:
        unfound = [c.label for c in waiting if not c.pattern]
        notes.append(
            Limitation(
                area="Concepts no model judged",
                statement=(
                    f"{count(len(waiting), 'concept')} {plural(len(waiting), 'is', 'are')} meant "
                    f"to be judged by a model, and this run asked none, so "
                    + (
                        f"{', '.join(unfound)}, with no pattern, "
                        f"{plural(len(unfound), 'was', 'were')} not looked for at all. "
                        if unfound
                        else "they were found by their patterns alone. "
                    )
                    + "Run with --judge-concepts jev to ask one, which sends page text to TypeSafe."
                ),
                affected=[c.label for c in waiting],
                severity="important" if unfound else "info",
            )
        )
    if summary.unjudged:
        notes.append(
            Limitation(
                area="Concept questions that failed",
                statement=(
                    f"{count(summary.unjudged, 'question')} to the {summary.judge} judge failed. "
                    f"A failed question says nothing either way, so a concept on those pages "
                    f"may be missing rather than absent."
                ),
                severity="important",
            )
        )
    return notes


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
        *_verification(run, documents),
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
