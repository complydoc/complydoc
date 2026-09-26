"""The report object, and the JSON schema it serialises to.

`SCHEMA_VERSION` is bumped whenever the JSON shape changes, so that runs stored
over time can be diffed with confidence about what a difference means.

Version 2 renamed the difficulty component to readiness. A high score always
meant a document that was easy to process, which read backwards under a name
that promised the opposite.
"""

from __future__ import annotations

import datetime as dt
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from complydoc.config.schema import MaskingConfig
from complydoc.cost.estimator import DocumentCostEstimate, FolderCostEstimate
from complydoc.ingest import ocr as ocr_module
from complydoc.ingest.base import DocumentFormat, SkipRecord
from complydoc.readiness.analyser import ReadinessReport
from complydoc.readiness.base import SignalStatus
from complydoc.report.preview import PagePreview
from complydoc.sensitive.base import SensitiveMatch
from complydoc.sensitive.scanner import ScanResult

if TYPE_CHECKING:  # pragma: no cover - type-checking imports only
    from complydoc.extraction.routing import DocumentRouting
    from complydoc.report.overall import OverallReadiness
    from complydoc.report.quickwins import QuickWin
    from complydoc.report.routing import RoutingSummary

__all__ = [
    "SCHEMA_VERSION",
    "Aggregate",
    "AuditReport",
    "ContentFinding",
    "DocumentReport",
    "DocumentTiming",
    "DocumentVerification",
    "ExtractorReading",
    "FactCheck",
    "IdentifierDifference",
    "IgnoreRule",
    "IgnoreSummary",
    "IgnoredFinding",
    "Limitation",
    "LoaderComparison",
    "PageText",
    "PageVerification",
    "ReadingCost",
    "RunMetadata",
    "VerificationSummary",
]

SCHEMA_VERSION = 17


def report_shape() -> dict[str, object]:
    """What a report's JSON holds, for code that parses it.

    Lives next to the version it describes, and is the single source for both
    `complydoc schema` and the documentation. Written by hand because it is a
    summary; a full JSON Schema of this shape is about four hundred lines.
    """
    return {
        "schema_version": SCHEMA_VERSION,
        "top_level_keys": [
            "run",
            "documents",
            "skipped",
            "cost",
            "aggregate",
            "overall",
            "quick_wins",
            "loader",
            "loader_comparison",
            "routing",
            "verification",
            "ignores",
            "limitations",
            "staleness_warnings",
            "signal_weights",
            "config_masking",
        ],
        "run": {
            "components_run": "list of cost | readiness | sensitive",
            "offline_guard": "armed | not_armed",
            "content_sent_to": (
                "hosts sent document text or page images, empty unless a hosted "
                "classifier or a vision model ran"
            ),
            "verify_model": "the vision reader pages were checked against, null unless --verify",
            "verify_scope": "flagged | all, null unless --verify",
            "classifier_missed_workers": "documents a registered classifier could not reach",
            "classifier_calls": "calls a registered classifier made, 0 unless one ran",
            "classifier_failures": "of those, calls that raised and so produced no score",
            "reveal_used": "bool — true means values are NOT masked",
            "page_images_used": "bool",
            "extracted_text_used": "bool",
            "report_detail": (
                "summary | full — summary leaves out documents[].cost.models, "
                "documents[].previews and cost.documents; full writes every field"
            ),
            "jobs": "worker processes used",
            "timeout_seconds": "seconds each document was given, when --timeout was used",
            "documents_read_after_worker_failure": "documents re-read after a worker stopped",
            "config_digest": "identifies the config that produced these numbers",
        },
        "documents[]": {
            "relative_path": "str",
            "sha256": "str",
            "format": "pdf | image | docx | xlsx | pptx | html | markdown | text | email | other",
            "cost": "pages, page_count, text layer and coverage for this document",
            "cost.models[]": (
                "full only: every priced model against this document, with text and "
                "vision token counts and USD"
            ),
            "previews[]": "full only: page geometry the HTML report draws its page views from",
            "readiness.signals[]": "id, value, rating, weight, why, status",
            "readiness.score": "value 0-100, higher is better; label; low_confidence",
            "sensitive.matches[]": (
                "category, page, line, column, masked, severity, fingerprint, and evidence: "
                "confirmed | corroborated | pattern | model"
            ),
            "sensitive.unreadable_pages": "pages that were not searched at all",
            "sensitive.models_used": (
                "category -> the detector and model that answered for it, where a "
                "model rather than a pattern read it"
            ),
            "extractions[]": "one per reader asked for; the first is the one kept",
            "extracted_text[].costs": (
                "reader -> usd, basis (local | actual | estimated | unpriced), model, "
                "input_tokens, output_tokens: what each reading of the page cost"
            ),
            "extracted_text[].seconds": "reader -> seconds it took on this page, where timed",
            "extracted_text[].tokens": (
                "reader -> tokenizer -> text tokens in that reading of the page"
            ),
            "extracted_text[].image_tokens": "vision formula -> image tokens for the page",
            "extracted_text[].masked_text": (
                "with --reveal only: the page's text with every identifier covered, "
                "beside `text`, which holds the values; also masked_ocr_text and "
                "masked_readings"
            ),
            "extracted_text[].vision_estimate": (
                "what the cheapest priced vision model would cost for this page, estimated"
            ),
            "verification": (
                "null unless --verify: model, scope, pages[] (number, status: agrees | "
                "disagrees | filled | failed | not_rendered, why, similarity, coverage, "
                "missing, cost), unreadable_pages[], sent_to[]"
            ),
            "metadata_findings[]": "key, category, severity, evidence, masked (from metadata)",
            "content_findings[]": (
                "page, visibility (visible | not_measured | suspected | confirmed), "
                "instruction (confirmed | pattern | model | none), severity, excerpt, "
                "hidden_reasons[], instruction_reasons[], score, in_loader_output, fingerprint"
            ),
            "ignored[]": (
                "findings an ignore file set aside, left out of every count and rule: "
                "fingerprint, kind (identifier | content), reason, by, until, and the "
                "finding itself as identifier or content"
            ),
            "visibility_checked": "bool, null when the scan did not run",
            "path_exposures": "metadata keys holding an absolute filesystem path",
        },
        "cost": (
            "null unless cost ran: currency, headline_resolution, resolutions[], volume, "
            "prices_as_of (the date of the oldest price used), "
            "models[] (the folder's cost per model and per path: text_layer, text_ocr, "
            "vision, each with folder_usd, per_1000_usd and annual_usd; and the model's "
            "input_per_mtok_usd, supports_vision, vision_formula and tokenizer, to price "
            "one page), and, full only, documents[] (every document against every model)"
        ),
        "overall": {
            "score": "global readiness 0-100, content and cost path and exposure",
            "factors[]": "name, score (null when not measured), weight, why",
            "bands": "documents per band — the composition the mean hides",
        },
        "quick_wins[]": "id, title, detail, documents[], actor (complydoc | you), effect",
        "loader": (
            "null unless documents came from an external loader: name, "
            "documents_returned, seconds, network_allowed, network_attempts[], error, tags[], "
            "metadata_keys[]"
        ),
        "loader_comparison": (
            "null unless compare_loaders ran: baseline, loaders[] (per-loader totals, "
            "network, scores, failures, facts_found, parser_usd, tags[]), facts[] (found, "
            "scores, and nearest: the passage that came closest where a fact was missed), "
            "identifier_differences[] (found_by[], missed_by[]), "
            "metadata_keys (key -> loaders returning it), documents (path -> loaders), "
            "recommended (the loader to use, null where the run cannot tell), verdict "
            "(what decided it), ranked[]"
        ),
        "aggregate": (
            "folder totals: cost, signal_distribution, sensitive_by_category, "
            "content_matrix (instruction -> visibility -> passages)"
        ),
        "verification": (
            "null unless --verify: model, scope, min_coverage, pages_total, pages_checked, "
            "pages_agree, pages_disagree, pages_filled, pages_failed, pages_unreadable, "
            "usd, usd_basis, headline"
        ),
        "ignores": (
            "null unless an ignore file was read: file, rules[] (finding, reason, by, "
            "until, paths[], what, matched, expired)"
        ),
        "limitations[]": "area, statement, affected[], severity (info | important)",
    }


@dataclass(frozen=True, slots=True)
class MetadataFinding:
    """An identifier found in a document's metadata.

    Loaders attach metadata to every document they return, and it is usually
    stored beside the content — in a vector store, next to each chunk — so an
    identifier there travels exactly as far as one in the text.
    """

    key: str
    category: str
    label: str
    severity: str
    evidence: str
    masked: str
    revealed: str | None = None
    page: int | None = None

    @property
    def significant(self) -> bool:
        """Whether this finding raises limitations and quick wins.

        A low-severity category found by the name model is excluded. Loaders put
        the producing software in metadata — "ReportLab PDF Library", "Microsoft
        Word" — and the model labels it an organisation, which would otherwise
        flag every PDF. It stays in the list; it does not become a limitation or
        a quick win on its own.
        """
        return not (self.severity == "low" and self.evidence == "model")


@dataclass(frozen=True, slots=True)
class LoaderRun:
    """What an external loader did when complydoc ran it."""

    name: str
    documents_returned: int
    seconds: float | None
    """None when documents were passed in already loaded."""
    network_attempts: list[str] = field(default_factory=list)
    """Connections the loader tried to open: refused by the guard, or made, when
    `network_allowed` is true."""
    error: str | None = None
    metadata_keys: list[str] = field(default_factory=list)
    """Every metadata key the loader returned, across all documents."""
    failures: dict[str, str] = field(default_factory=dict)
    """Files the loader raised on, with the error, when it ran over several files."""
    cached_files: int = 0
    """Files whose output came from the cache instead of the loader."""
    network_allowed: bool = False
    """The caller passed `allow_network=True`, so the loader's connections went
    through. complydoc's own processing stays behind the guard either way."""
    tags: list[str] = field(default_factory=list)
    """The framework and library the loader comes from, such as `LangChain` and `pypdf`."""


@dataclass(frozen=True, slots=True)
class ContentFinding:
    """A passage that is hidden from a reader, reads as an instruction to a model, or both."""

    page: int | None
    visibility: str
    """`visible`, `not_measured`, `suspected` (one signal) or `confirmed`."""
    instruction: str
    """`confirmed` (decoded from hidden characters), `pattern`, `model` or `none`."""
    severity: str
    excerpt: str
    """The passage, identifiers masked unless the run used `reveal`, cut at 240 characters."""
    characters: int
    hidden_reasons: list[str] = field(default_factory=list)
    instruction_reasons: list[str] = field(default_factory=list)
    score: float | None = None
    """The registered classifier's score, when there is one."""
    in_loader_output: bool | None = None
    """For loader output: whether the loader's text contains this passage."""
    fingerprint: str = ""
    """The same for this passage in every document and run; what an ignore file names."""


@dataclass(frozen=True, slots=True)
class LoaderSummary:
    """One loader's totals, in a comparison of several."""

    name: str
    documents: int
    pages: int
    characters: int
    seconds: float | None
    network_allowed: bool
    network_attempts: list[str]
    error: str | None
    metadata_keys: list[str]
    identifiers_in_text: int
    identifiers_in_metadata: int
    documents_with_paths: int
    """Documents with at least one metadata key holding an absolute path."""
    readiness_score: float | None
    global_score: float | None
    text_path_usd: float | None
    failures: dict[str, str] = field(default_factory=dict)
    """Files the loader raised on, with the error."""
    cached_files: int = 0
    facts_found: int | None = None
    """Expected facts found in this loader's text, when facts were given."""
    parser_usd: float | None = None
    """Estimated parser cost for these pages, from `parsers` in `pricing.yaml`."""
    tags: list[str] = field(default_factory=list)
    """The framework and library the loader comes from, such as `LangChain` and `pypdf`."""


@dataclass(frozen=True, slots=True)
class IdentifierDifference:
    """An identifier in some loaders' output and not in others'.

    Matched by where it was found, its category and its masked value, so the
    same identifier read by two loaders is one row. Metadata findings are
    matched regardless of key name, because loaders spell the same field
    differently: `producer` in one, `Producer` in another.
    """

    document: str
    category: str
    label: str
    severity: str
    evidence: str
    value: str
    """Masked, unless the run used `reveal`."""
    location: str
    """`text` or `metadata`."""
    keys: list[str]
    """The metadata keys it was found under. Empty for text."""
    found_by: list[str]
    missed_by: list[str]

    @property
    def significant(self) -> bool:
        return not (self.severity == "low" and self.evidence == "model")


@dataclass(frozen=True, slots=True)
class FactCheck:
    """Whether one expected fact appears in the text of each loader."""

    fact: str
    document: str | None
    """The document the fact was checked in, or None for every document."""
    found: dict[str, str | None]
    """Loader name to `exact`, `fuzzy`, or None."""
    scores: dict[str, float]
    """Loader name to the best similarity found, from 0 to 1."""
    pages: dict[str, int | None]
    documents: dict[str, str | None]
    """Loader name to the document the fact was found in."""
    nearest: dict[str, str | None] = field(default_factory=dict)
    """Loader name to the passage that came closest, where the fact was not found exactly.

    What a missing fact looks like in that loader's text, which is usually the
    reason it went missing.
    """


@dataclass(frozen=True, slots=True)
class LoaderComparison:
    """Where several loaders' output differed, measured against the first."""

    baseline: str
    loaders: list[LoaderSummary]
    identifier_differences: list[IdentifierDifference] = field(default_factory=list)
    metadata_keys: dict[str, list[str]] = field(default_factory=dict)
    """Keys not returned by every loader, matched ignoring case, and which returned them."""
    documents: dict[str, list[str]] = field(default_factory=dict)
    """Documents not returned by every loader, and which loaders returned them."""
    facts: list[FactCheck] = field(default_factory=list)
    """Expected facts, checked against every loader's text."""
    recommended: str | None = None
    """The loader to use, where the run could tell. None when it could not."""
    verdict: str = ""
    """What decided the recommendation, or what stopped it being decided."""
    ranked: list[str] = field(default_factory=list)
    """Every loader, best first, by what the run could measure."""


@dataclass(frozen=True, slots=True)
class Limitation:
    """One thing this particular run did not or could not check."""

    area: str
    statement: str
    affected: list[str] = field(default_factory=list)
    severity: str = "info"
    """'info' or 'important'. Important means it could change a conclusion."""


@dataclass(frozen=True, slots=True)
class RunMetadata:
    tool_version: str
    schema_version: int
    started_at: str
    finished_at: str
    duration_seconds: float
    target: str
    components_run: list[str]
    config_dir: str
    config_digest: str
    offline_guard: str
    reveal_used: bool
    page_images_used: bool
    extracted_text_used: bool
    ocr_compare_used: bool
    ocr_requested: bool
    ocr_available: bool
    ner_available: bool
    python_version: str
    monthly_volume: int | None
    extractor: str = "pdfplumber"
    """Which extractor's reading the findings were built from."""
    compare_extractors: list[str] = field(default_factory=list)
    compare_engines: list[str] = field(default_factory=list)
    jobs: int = 1
    """Worker processes used. More than one changes nothing about the findings."""
    timeout_seconds: float | None = None
    """Seconds each document was given, when --timeout was used."""
    sampled_from: int | None = None
    """Documents found, when --sample meant only some of them were opened."""
    sample_size: int | None = None
    """Documents the sample selected. Fewer may appear if one failed to parse."""
    password_used: bool = False
    report_detail: str = "full"
    """`summary` when the JSON left out the per-document price list and page geometry.

    Written into the file by the writer, so a reader can tell a part that was left
    out from a part that was empty.
    """
    documents_read_after_worker_failure: int = 0
    """Documents read in the main process after a worker process stopped."""
    content_sent_to: list[str] = field(default_factory=list)
    """Hosts that were sent text from these documents.

    Empty for an ordinary run: nothing leaves the machine, and the guard is
    armed to keep it that way. A classifier the caller registered against a
    hosted service fills this, so the report says where the documents went
    rather than leaving that to whoever set the run up to remember.
    """
    classifier_missed_workers: int = 0
    """Documents read in a worker, where a registered classifier does not exist.

    A classifier is registered in one process. Documents spread over a pool are
    read in others, and it cannot follow them there, so it did not run for these.
    """
    classifier_calls: int = 0
    """Calls a registered classifier made during this run, across every process."""
    verify_model: str | None = None
    """The vision reader every checked page was read with again, by its reading name.

    None for a run that verified nothing, which is every run without `--verify`.
    """
    verify_scope: str | None = None
    """`flagged` for the pages routing marked, `all` for every page."""
    classifier_failures: int = 0
    """Of those, the calls that raised and so produced no score.

    A failed call is treated as no answer rather than as a zero, because a
    service that is down must not read as a document that is clean. But no
    answer is also no finding, so without this count a run whose every call
    failed was indistinguishable from a run that found nothing.
    """


@dataclass(frozen=True, slots=True)
class DocumentTiming:
    """Wall clock spent on one document."""

    read_seconds: float
    analyse_seconds: float
    scan_seconds: float
    total_seconds: float
    seconds_per_page: float | None


@dataclass(frozen=True, slots=True)
class ReadingCost:
    """What one reading of one page cost to make.

    A reader that runs on this machine — a text-layer library, local OCR — costs
    machine time and no money, and says so as `local` rather than borrowing a
    price to look comparable. A hosted reader is `actual` when the provider's
    own token count came back with the reading, `estimated` when the figure is
    worked out from the page's size and the price table, and `unpriced` when
    no price for it is known.
    """

    usd: float | None
    """None when the reader is `unpriced`."""
    basis: str
    """`local`, `actual`, `estimated` or `unpriced`."""
    model: str | None = None
    """The priced model the figure is for, where there is one."""
    input_tokens: int | None = None
    output_tokens: int | None = None


@dataclass(frozen=True, slots=True)
class PageText:
    """The text read off one page, for checking extraction quality."""

    number: int
    source: str
    characters: int
    text: str
    ocr_text: str = ""
    truncated: bool = False
    readings: dict[str, str] = field(default_factory=dict)
    """What each reader compared on this run made of the page, by name."""
    kept: str = ""
    """The reader whose text `text` is. Empty where the run could not tell."""
    costs: dict[str, ReadingCost] = field(default_factory=dict)
    """What each reading of this page cost, keyed like `readings`, with the kept one."""
    seconds: dict[str, float] = field(default_factory=dict)
    """How long each reader took on this page, keyed like `costs`, measured on
    the machine that ran it. A reader that was not timed is absent, not zero."""
    tokens: dict[str, dict[str, int]] = field(default_factory=dict)
    """Text tokens in each reading of this page, by reader, then by way of counting.

    Keyed like `costs`, then by `cost.models[].tokenizer`, so the page can be
    priced for each reader on any model the run compared.
    """
    image_tokens: dict[str, int] = field(default_factory=dict)
    """Image tokens for this page at the run's headline resolution, by
    `cost.models[].vision_formula`. Empty where the page's size is not known."""
    vision_estimate: ReadingCost | None = None
    """What sending this page to the cheapest priced vision model would cost.

    Estimated from the page's size at the run's headline resolution. Set where
    the run priced models, whether or not a vision model read the page, so the
    reading kept can be weighed against what a vision read would have cost.
    """
    masked_text: str | None = None
    """On a run with --reveal, `text` with every identifier covered; None otherwise.

    A revealing report holds the values, and a viewer that shows them by default
    shows them to whoever is looking at the screen. With this copy it can open
    masked and reveal on request.
    """
    masked_ocr_text: str | None = None
    """`ocr_text` covered the same way, on a run with --reveal."""
    masked_readings: dict[str, str] | None = None
    """`readings` covered the same way, on a run with --reveal."""


@dataclass(frozen=True, slots=True)
class PageVerification:
    """One page read again by a vision model, and whether the two readings agree."""

    number: int
    status: str
    """`agrees`, `disagrees`, `filled` (no usable reading, so the vision one was
    kept), `failed` (the model raised) or `not_rendered` (no picture of the page
    could be made)."""
    why: str
    """Why this page was checked."""
    similarity: float | None = None
    """How closely the two readings match word for word, in order, 0 to 1."""
    coverage: float | None = None
    """Share of the vision reading's words that are in the kept reading, 0 to 1.

    What decides agreement. A vision model lays a page out its own way — table
    pipes, headings, a different line order — so an in-order score is low
    between two readings holding the same content. Coverage asks the question
    that matters here: is there anything on the page the kept reading lacks.
    """
    missing: str = ""
    """What the vision reading has that the kept one does not, longest run first,
    masked unless the run used `reveal`, cut at 240 characters."""
    cost: ReadingCost | None = None
    error: str | None = None
    seconds: float | None = None
    """How long the model took to answer for this page, from the call to its return."""


@dataclass(frozen=True, slots=True)
class DocumentVerification:
    """Every page of one document a vision model read again, and what it found."""

    model: str
    """The reading's name, `vision:` and the model."""
    scope: str
    """`flagged` or `all`."""
    pages_total: int
    pages: list[PageVerification] = field(default_factory=list)
    unreadable_pages: list[int] = field(default_factory=list)
    """Pages with no text and no image on them, known before any model was called."""
    sent_to: list[str] = field(default_factory=list)
    """Hosts the page images went to, as the network guard recorded them."""

    def count(self, status: str) -> int:
        return sum(1 for page in self.pages if page.status == status)

    @property
    def usd(self) -> float | None:
        values = [p.cost.usd for p in self.pages if p.cost is not None and p.cost.usd is not None]
        return round(sum(values), 6) if values else None


@dataclass(frozen=True, slots=True)
class VerificationSummary:
    """The folder against an independent vision read: pages checked, and pages that disagree."""

    model: str
    scope: str
    min_coverage: float
    """Coverage at or above which a page agrees, 0 to 1."""
    documents: int
    pages_total: int
    pages_checked: int
    pages_agree: int
    pages_disagree: int
    pages_filled: int
    pages_failed: int
    pages_unreadable: int
    usd: float | None
    usd_basis: str
    """`actual`, `estimated`, `mixed`, or `unpriced` when no page carried a price."""
    headline: str
    """One sentence a person reads first, such as "3 of 80 pages disagree"."""


_SIMILAR_ENOUGH = 0.95
"""Below this, two readings of a page are telling different stories.

Line endings and stray whitespace put agreeing extractors at about 0.99 of each
other; a scrambled two-column page measures around 0.1.
"""


@dataclass(frozen=True, slots=True)
class ExtractorReading:
    """What one extractor made of one document, totalled over its pages."""

    extractor: str
    characters: int
    mean_coverage_pct: float | None
    """None when the reader returns no geometry to measure coverage from."""
    seconds: float
    granularity: str
    reads_tables: bool
    similarity: float = 1.0
    """How closely this reading matched the one kept, compared in order."""
    reordered: bool = False
    """True when it held the same words as the kept reading in another order."""

    @property
    def read_nothing(self) -> bool:
        return self.characters == 0


@dataclass(slots=True)
class IgnoredFinding:
    """A finding an ignore file set aside, with the reason it gave.

    Kept in the report, so what was ignored stays visible, and out of every
    count, limitation, quick win and rule, so it no longer fails a check.
    """

    fingerprint: str
    kind: str
    """`identifier` (one of `sensitive.matches`) or `content` (one of `content_findings`)."""
    reason: str
    by: str | None = None
    until: str | None = None
    """The date the ignore stops applying, ISO format, or None for never."""
    identifier: SensitiveMatch | None = None
    content: ContentFinding | None = None


@dataclass(slots=True)
class IgnoreRule:
    """One entry of the ignore file, and what it did on this run."""

    finding: str
    reason: str
    by: str | None = None
    until: str | None = None
    paths: list[str] = field(default_factory=list)
    """Globs of relative paths it is limited to. Empty means every document."""
    what: str | None = None
    """What the finding is, in words, as the person who ignored it wrote it."""
    added: str | None = None
    matched: int = 0
    """Findings it set aside on this run."""
    expired: bool = False
    """Past its `until`: it set nothing aside, and the findings are counted again."""


@dataclass(slots=True)
class IgnoreSummary:
    """The ignore file a run read, and each of its entries."""

    file: str
    rules: list[IgnoreRule] = field(default_factory=list)

    @property
    def expired(self) -> list[IgnoreRule]:
        return [rule for rule in self.rules if rule.expired]

    @property
    def unused(self) -> list[IgnoreRule]:
        return [rule for rule in self.rules if not rule.expired and rule.matched == 0]


@dataclass(slots=True)
class DocumentReport:
    path: Path
    relative_path: str
    sha256: str
    format: DocumentFormat
    page_count: int
    page_count_known: bool
    load_warnings: list[str] = field(default_factory=list)
    cost: DocumentCostEstimate | None = None
    readiness: ReadinessReport | None = None
    sensitive: ScanResult | None = None
    routing: DocumentRouting | None = None
    """The route each page needs: its text layer, OCR, or a vision model."""
    previews: list[PagePreview] = field(default_factory=list)
    """Per-page wireframes. Geometry only — never document content."""
    timing: DocumentTiming | None = None
    extracted_text: list[PageText] = field(default_factory=list)
    """The text itself. Only populated with --extracted-text: it is the document."""
    extractions: list[ExtractorReading] = field(default_factory=list)
    """One per extractor the run was asked for. The first is the one kept."""
    metadata_findings: list[MetadataFinding] = field(default_factory=list)
    """Identifiers in the metadata a loader returned. Empty for files read directly."""
    content_findings: list[ContentFinding] = field(default_factory=list)
    """Hidden passages and instruction-like text. See `complydoc.hidden`."""
    verification: DocumentVerification | None = None
    """Pages read again by a vision model. None unless the run used `--verify`."""
    visibility_checked: bool | None = None
    """Whether hidden text could be checked for. None when the scan did not run."""
    visibility_note: str | None = None
    ignored: list[IgnoredFinding] = field(default_factory=list)
    """Findings an ignore file set aside. Not in `sensitive.matches` or `content_findings`."""
    path_exposures: list[str] = field(default_factory=list)
    """Metadata keys whose value is an absolute filesystem path.

    Not an identifier category, and no detector would flag it, but a home
    directory path names the account it belongs to and the layout around it.
    """

    @property
    def extractors_disagree(self) -> bool:
        """Whether the extractors read this document differently enough to say so.

        Measured against the one whose output was kept. A tenth of the text is
        the line: below that the difference is line endings and whitespace, and
        reporting it would be noise on every document.
        """
        return self.disagreement is not None

    @property
    def disagreement(self) -> str | None:
        """The kind of disagreement between extractors, or None."""
        if len(self.extractions) < 2:
            return None
        kept = self.extractions[0]
        for other in self.extractions[1:]:
            if kept.read_nothing != other.read_nothing:
                return "one of them read nothing"
            highest = max(kept.characters, other.characters, 1)
            if abs(kept.characters - other.characters) / highest > 0.10:
                return "they read different amounts"
            # Counting characters is not enough. Two extractors can return the
            # same characters in a different order — one reading straight
            # across a two-column page and scrambling every sentence — and a
            # count says they agreed.
            if other.similarity < _SIMILAR_ENOUGH:
                return (
                    "same words, different order"
                    if other.reordered
                    else "they read different words"
                )
        return None


@dataclass(slots=True)
class Aggregate:
    """What a decision maker reads."""

    documents_audited: int
    documents_skipped: int
    pages_total: int
    pages_unreadable: int
    formats: dict[str, int] = field(default_factory=dict)

    total_text_path_usd: float | None = None
    total_vision_path_usd: float | None = None
    monthly_text_usd: float | None = None
    monthly_vision_usd: float | None = None
    annual_text_usd: float | None = None
    annual_vision_usd: float | None = None
    currency: str = "USD"

    signal_distribution: dict[str, dict[str, int]] = field(default_factory=dict)
    """signal id -> {good, fair, poor, not_applicable, error} counts across documents."""
    readiness_bands: dict[str, int] = field(default_factory=dict)
    mean_readiness_score: float | None = None

    sensitive_by_category: dict[str, int] = field(default_factory=dict)
    sensitive_by_severity: dict[str, int] = field(default_factory=dict)
    sensitive_total: int = 0
    documents_with_sensitive_data: int = 0
    categories_not_scanned: dict[str, str] = field(default_factory=dict)

    content_matrix: dict[str, dict[str, int]] = field(default_factory=dict)
    """Passages by instruction evidence, then by visibility."""
    content_findings_total: int = 0
    content_findings_high: int = 0
    documents_with_content_findings: int = 0
    documents_visibility_unchecked: int = 0
    ignored_total: int = 0
    """Findings an ignore file set aside, and so left out of the counts above."""

    total_seconds: float = 0.0
    """Wall clock for the whole run, measured on the machine that ran it."""
    seconds_per_document: float | None = None
    seconds_per_page: float | None = None
    ocr_pages: int = 0
    ocr_seconds: float = 0.0
    ocr_pages_per_second: float | None = None
    hours_per_1000_documents: float | None = None
    read_seconds: float = 0.0
    """Opening the file and pulling text, words and geometry out of it."""
    analyse_seconds: float = 0.0
    """Measuring the readiness signals."""
    scan_seconds: float = 0.0
    """Searching the text for identifiers."""
    projected_seconds: dict[str, float] = field(default_factory=dict)
    """Wall clock for a backlog of a given size, at the rate this run measured.

    Extrapolated from documents like these ones. A folder of longer or heavier
    scans takes longer, and this says nothing about time spent on the model.
    """


@dataclass(slots=True)
class AuditReport:
    run: RunMetadata
    documents: list[DocumentReport] = field(default_factory=list)
    skipped: list[SkipRecord] = field(default_factory=list)
    cost: FolderCostEstimate | None = None
    aggregate: Aggregate | None = None
    limitations: list[Limitation] = field(default_factory=list)
    staleness_warnings: list[str] = field(default_factory=list)
    signal_weights: dict[str, float] = field(default_factory=dict)
    """Printed in the report whenever a score is shown."""
    config_masking: MaskingConfig | None = None
    """Echoed so the report can state how much of a value is shown."""
    overall: OverallReadiness | None = None
    """Global readiness: content, cost and exposure combined.

    Both this and `quick_wins` are derived from a finished report, so their
    modules import this one. The annotations are resolved only by a type
    checker, which keeps the dependency one-way at runtime.
    """
    quick_wins: list[QuickWin] = field(default_factory=list)
    """What to do next, ranked. See `complydoc.report.quickwins`."""
    loader: LoaderRun | None = None
    """Set when the documents came from an external loader."""
    loader_comparison: LoaderComparison | None = None
    """Set by `compare_loaders`. `loader` is then the baseline's run."""
    routing: RoutingSummary | None = None
    """Pages per route for the folder, and what that mix costs. See
    `complydoc.report.routing`."""
    verification: VerificationSummary | None = None
    """How many pages an independent vision read agreed with. None unless `--verify`."""
    ignores: IgnoreSummary | None = None
    """The ignore file this run read, and what each entry set aside. None without one."""

    def to_pandas(self, table: str = "documents") -> Any:
        """One table of this report as a pandas DataFrame.

        Table names are in `complydoc.report.tables.TABLES`. Requires the `notebook` extra.
        """
        from complydoc.report.tables import to_pandas

        return to_pandas(self, table)

    def _repr_html_(self) -> str:
        from complydoc.report.tables import summary_html

        return summary_html(self)


@dataclass(frozen=True, slots=True)
class _ReadinessTally:
    """How the signals came out across the folder, and the scores they produced."""

    distribution: dict[str, dict[str, int]]
    scores: list[float]
    bands: Counter[str]


@dataclass(frozen=True, slots=True)
class _SensitiveTally:
    """What the identifier scan found across the folder, and what it could not look at."""

    unreadable_pages: int
    by_category: Counter[str]
    by_severity: Counter[str]
    not_scanned: dict[str, str]
    documents_with_data: int


@dataclass(frozen=True, slots=True)
class _ContentTally:
    """Hidden and instruction-like passages across the folder."""

    matrix: dict[str, dict[str, int]]
    total: int
    high: int
    documents_with_findings: int
    documents_unchecked: int


def _tally_readiness(documents: list[DocumentReport]) -> _ReadinessTally:
    distribution: dict[str, dict[str, int]] = {}
    scores: list[float] = []
    bands: Counter[str] = Counter()

    for document in documents:
        if document.readiness is None:
            continue
        for signal in document.readiness.signals:
            bucket = distribution.setdefault(
                signal.id,
                {"good": 0, "fair": 0, "poor": 0, "not_applicable": 0, "error": 0},
            )
            if signal.status is SignalStatus.ERROR:
                bucket["error"] += 1
            elif signal.status is SignalStatus.NOT_APPLICABLE:
                bucket["not_applicable"] += 1
            elif signal.rating:
                bucket[signal.rating] += 1
        if document.readiness.score is not None:
            scores.append(document.readiness.score.value)
            bands[document.readiness.score.label] += 1

    return _ReadinessTally(distribution, scores, bands)


def _tally_sensitive(documents: list[DocumentReport]) -> _SensitiveTally:
    unreadable = 0
    by_category: Counter[str] = Counter()
    by_severity: Counter[str] = Counter()
    not_scanned: dict[str, str] = {}
    with_data = 0

    for document in documents:
        if document.sensitive is None:
            continue
        unreadable += len(document.sensitive.unreadable_pages)
        by_category.update(document.sensitive.counts_by_category)
        by_severity.update(document.sensitive.counts_by_severity)
        if document.sensitive.total:
            with_data += 1
        # The first reason given for a category: they are the same reason on
        # every document, because it is the run that could not scan it.
        for entry in document.sensitive.unscanned_categories:
            not_scanned.setdefault(entry.category, entry.reason)

    return _SensitiveTally(unreadable, by_category, by_severity, not_scanned, with_data)


def _tally_content(documents: list[DocumentReport]) -> _ContentTally:
    matrix: dict[str, dict[str, int]] = {}
    total = high = with_findings = unchecked = 0

    for document in documents:
        for finding in document.content_findings:
            row = matrix.setdefault(finding.instruction, {})
            row[finding.visibility] = row.get(finding.visibility, 0) + 1
            total += 1
            high += finding.severity == "high"
        with_findings += bool(document.content_findings)
        unchecked += document.visibility_checked is False

    return _ContentTally(matrix, total, high, with_findings, unchecked)


def build_aggregate(
    documents: list[DocumentReport],
    skipped: list[SkipRecord],
    cost: FolderCostEstimate | None,
) -> Aggregate:
    formats: Counter[str] = Counter(d.format.value for d in documents)
    pages = sum(d.page_count for d in documents)
    readiness = _tally_readiness(documents)
    sensitive = _tally_sensitive(documents)
    content = _tally_content(documents)

    timings = [d.timing for d in documents if d.timing]
    measured_seconds = sum(t.total_seconds for t in timings)
    ocr_pages, ocr_seconds = ocr_module.stats()

    aggregate = Aggregate(
        documents_audited=len(documents),
        documents_skipped=len(skipped),
        pages_total=pages,
        pages_unreadable=sensitive.unreadable_pages,
        formats=dict(formats),
        signal_distribution=readiness.distribution,
        readiness_bands=dict(readiness.bands),
        mean_readiness_score=(
            round(sum(readiness.scores) / len(readiness.scores), 1) if readiness.scores else None
        ),
        sensitive_by_category=dict(sensitive.by_category),
        sensitive_by_severity=dict(sensitive.by_severity),
        sensitive_total=int(sum(sensitive.by_category.values())),
        documents_with_sensitive_data=sensitive.documents_with_data,
        categories_not_scanned=sensitive.not_scanned,
        content_matrix=content.matrix,
        content_findings_total=content.total,
        content_findings_high=content.high,
        documents_with_content_findings=content.documents_with_findings,
        documents_visibility_unchecked=content.documents_unchecked,
        ignored_total=sum(len(d.ignored) for d in documents),
        total_seconds=round(measured_seconds, 3),
        seconds_per_document=(round(measured_seconds / len(timings), 3) if timings else None),
        seconds_per_page=round(measured_seconds / pages, 3) if pages else None,
        ocr_pages=ocr_pages,
        ocr_seconds=ocr_seconds,
        ocr_pages_per_second=(round(ocr_pages / ocr_seconds, 2) if ocr_seconds > 0 else None),
        hours_per_1000_documents=(
            round(measured_seconds / len(timings) * 1000 / 3600, 2) if timings else None
        ),
        read_seconds=round(sum(t.read_seconds for t in timings), 3),
        analyse_seconds=round(sum(t.analyse_seconds for t in timings), 3),
        scan_seconds=round(sum(t.scan_seconds for t in timings), 3),
        projected_seconds=(
            {
                str(size): round(measured_seconds / len(timings) * size, 1)
                for size in (100, 1_000, 10_000, 100_000)
            }
            if timings
            else {}
        ),
    )

    if cost is not None:
        resolution = cost.headline_resolution
        aggregate.currency = cost.currency
        aggregate.total_text_path_usd = cost.total_text_path_usd()
        aggregate.total_vision_path_usd = cost.total_vision_path_usd(resolution)
        if cost.volume is not None:
            aggregate.monthly_text_usd = cost.volume.monthly_text_usd
            aggregate.monthly_vision_usd = cost.volume.monthly_vision_usd
            aggregate.annual_text_usd = cost.volume.annual_text_usd
            aggregate.annual_vision_usd = cost.volume.annual_vision_usd

    return aggregate


def to_jsonable(value: Any) -> Any:
    """Convert the report tree into something json.dump can write."""
    import dataclasses
    import enum

    from pydantic import BaseModel

    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {f.name: to_jsonable(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dt.date | dt.datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple | set | frozenset):
        return [to_jsonable(v) for v in value]
    return value
