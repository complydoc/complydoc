"""One document read into its report entry: text, cost, readiness, identifiers, hidden text.

Everything here happens where the document is, in this process or a worker, and only the
finished entry leaves: `Work` is what crosses into a worker, and it is kept picklable.
"""

from __future__ import annotations

import datetime as dt
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from complydoc.concepts import (
    Concept,
    judge_pages,
    registered_concept_judge,
)
from complydoc.config.schema import CategoryConfig, Config, ModelPricing, TokenizerSpec
from complydoc.cost.estimator import estimate_document
from complydoc.cost.tokenizer import count_tokens, tokenizer_key
from complydoc.cost.vision import vision_tokens
from complydoc.extraction.routing import plan_routes
from complydoc.hidden.check import check_content
from complydoc.ingest import ocr as ocr_module
from complydoc.ingest.base import (
    Document,
    DocumentFormat,
    IngestOptions,
    Page,
)
from complydoc.readiness.analyser import analyse
from complydoc.report.models import (
    ConceptFinding,
    DocumentReport,
    DocumentTiming,
    DocumentVerification,
    ExtractorReading,
    PageText,
    ReadingCost,
)
from complydoc.report.preview import build_previews
from complydoc.sensitive.base import SensitiveMatch
from complydoc.sensitive.masking import carried_matches, found_values
from complydoc.sensitive.scanner import ScanResult, scan, scan_text
from complydoc.verification.check import verify_document
from complydoc.verification.vision import (
    registered_vision_model,
)

_MAX_TEXT_CHARS = 20_000
"""Per page, so one enormous document cannot make the report unopenable."""


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
    concepts: tuple[Concept, ...] = ()
    """Your own concepts, for those a judgement model is to be asked about."""
    concept_judge: str | None = None
    """The judge each worker resolves, as for `classifier`, or None for one
    registered in this process, or for a run that asks none."""
    judging: bool = False
    """Put the concepts marked `judge` to the registered concept judge."""


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


def _mask(
    text: str, work: Work, located: list[SensitiveMatch] | None = None, *, fully: bool = False
) -> str:
    """`text` with its identifiers covered, unless the run reveals them.

    `fully` covers every identifier even on a run that reveals them: the masked
    copy a revealing report keeps beside the values, so a viewer can show either.
    """
    # Imported here: extract builds on the audit, which builds on this module.
    from complydoc.extraction.extract import mask_matches

    if not text.strip():
        return text
    if located is None:
        located, _unavailable = scan_text(
            text, work.config.sensitive, reveal=work.reveal, masking=True
        )
    if work.reveal and not fully:
        located = [m for m in located if m.revealed is None]
    return mask_matches(text, located)[0]


_LOCAL = ReadingCost(0.0, "local")
"""A reader that ran on this machine: machine time, and no bill."""


NATIVE_READERS: dict[DocumentFormat, str] = {
    DocumentFormat.DOCX: "python-docx",
    DocumentFormat.XLSX: "openpyxl",
    DocumentFormat.PPTX: "complydoc-pptx",
    DocumentFormat.HTML: "lxml",
    DocumentFormat.MARKDOWN: "complydoc-text",
    DocumentFormat.TEXT: "complydoc-text",
    DocumentFormat.EMAIL: "email",
}
"""The reader of each format's own text, other than a PDF's.

A PDF's text layer is read by the extractor the run chose, and a loader's by the
loader. Every other format is read by the one library complydoc has for it, and
naming the PDF extractor there claimed pdfplumber had read a spreadsheet.
"""


def _kept_by(
    page: Page, work: Work, verification: DocumentVerification | None, fmt: DocumentFormat
) -> str:
    """The reader whose text a page kept."""
    if page.text_source == "vision" and verification is not None:
        return verification.model
    if page.text_source == "ocr":
        return ocr_module.engine_name()
    if page.text_source == "loader":
        return work.options.extractor
    if page.text_source == "native":
        return NATIVE_READERS.get(fmt, work.options.extractor)
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


def _page_seconds(
    page: Page, kept: str, verification: DocumentVerification | None
) -> dict[str, float]:
    """How long each reader took on a page, where it was timed, keyed like its costs.

    A loader is timed over every file it read, not per page, so its pages carry
    no time of their own here; the loader's total is in the report's loader rows.
    """
    seconds = (
        {e.extractor: round(e.seconds, 4) for e in page.extractions}
        if page.text_source != "loader"
        else {}
    )
    if page.ocr_seconds is not None:
        seconds["ocr"] = page.ocr_seconds
        # A scan's kept reading is OCR's, after the text layer was tried and came up empty.
        if page.text_source == "ocr" and kept:
            seconds[kept] = round(page.ocr_seconds + seconds.get(kept, 0.0), 4)
    if verification is not None:
        for checked in verification.pages:
            if checked.number == page.number and checked.seconds is not None:
                seconds[verification.model] = checked.seconds
    return seconds


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
    fmt: DocumentFormat = DocumentFormat.PDF,
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
        # With what the silent categories found: these are for covering the text.
        matches = [m for m in (*scanned.matches, *scanned.silent) if m.page == page.number]

    # Every reading of the page scanned for itself, then each masked for what any of them
    # was found to hold: a name the model recognised in one reader's wording and missed
    # in another's is still a name, and is covered in both.
    def scanned_text(text: str) -> list[SensitiveMatch]:
        if not text.strip():
            return []
        return scan_text(text, work.config.sensitive, reveal=work.reveal, masking=True)[0]

    own = matches if matches is not None else scanned_text(page.text)
    readings = {
        name: own if reading == page.text else scanned_text(reading)
        for name, reading in page.readings.items()
    }
    ocr_found = scanned_text(page.ocr_text)
    found = [
        *found_values(page.text, own),
        *found_values(page.ocr_text, ocr_found),
        *(
            v
            for name, reading in page.readings.items()
            for v in found_values(reading, readings[name])
        ),
    ]

    def located(text: str, of_its_own: list[SensitiveMatch]) -> list[SensitiveMatch]:
        return [*of_its_own, *carried_matches(text, found)]

    at = {
        "text": located(page.text, own),
        "ocr": located(page.ocr_text, ocr_found),
        **{name: located(reading, readings[name]) for name, reading in page.readings.items()},
    }

    def masked(text: str, key: str, *, fully: bool = False) -> str:
        return _mask(text, work, at[key], fully=fully)[:_MAX_TEXT_CHARS]

    text = masked(page.text, "text")
    kept = _kept_by(page, work, verification, fmt)
    # On a revealing run, the same readings with every value covered too, so a
    # viewer can open masked and show the values only when asked.
    masked_text = masked_ocr = masked_readings = None
    if work.reveal:
        masked_text = masked(page.text, "text", fully=True)
        masked_ocr = masked(page.ocr_text, "ocr", fully=True)
        masked_readings = {
            name: masked(reading, name, fully=True) for name, reading in page.readings.items()
        }
    return PageText(
        number=page.number,
        source=page.text_source,
        characters=len(page.text),
        text=text,
        ocr_text=masked(page.ocr_text, "ocr"),
        truncated=len(page.text) > _MAX_TEXT_CHARS,
        readings={name: masked(reading, name) for name, reading in page.readings.items()},
        kept=kept,
        costs=_reading_costs(page, kept, verification),
        seconds=_page_seconds(page, kept, verification),
        tokens=_page_tokens(page, kept, tokenizers_of(work.models)),
        image_tokens=image_tokens or {},
        vision_estimate=vision_estimate,
        masked_text=masked_text,
        masked_ocr_text=masked_ocr,
        masked_readings=masked_readings,
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


def _judge_concepts(entry: DocumentReport, document: Document, work: Work) -> None:
    """Ask the registered judge which pages hold the concepts marked `judge`."""
    judge = registered_concept_judge()
    if not work.judging or judge is None or not any(c.judge for c in work.concepts):
        return
    found = {(m.category, m.page) for m in entry.sensitive.matches} if entry.sensitive else set()
    hits, failures = judge_pages(
        [(page.number, page.text) for page in document.pages], work.concepts, judge, found
    )
    entry.concept_findings = [
        ConceptFinding(
            page=page,
            concept=concept.id,
            label=concept.label,
            severity=concept.severity,
            score=score,
        )
        for concept, page, score in hits
    ]
    entry.concepts_unjudged = failures


def build_entry(
    document: Document,
    work: Work,
    read_seconds: float,
    relative_path: str,
    started_at: float | None = None,
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
        _judge_concepts(entry, document, work)
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
                document.format,
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
        started_at=round(started_at, 3) if started_at is not None else None,
    )
    return entry
