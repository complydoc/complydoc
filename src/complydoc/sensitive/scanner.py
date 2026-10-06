"""Component 3: find personal and financial identifiers, and report them masked.

The scan reports counts and locations. Values are masked unless `--reveal` was
passed, and categories under `masking.never_reveal` stay masked even then.

Pages with no readable text are recorded by number.
"""

from __future__ import annotations

from bisect import bisect_right
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from complydoc.config.schema import CategoryConfig, SensitiveConfig
from complydoc.fingerprint import identifier_fingerprint
from complydoc.ingest.base import Document
from complydoc.sensitive.base import (
    DetectorContext,
    Finding,
    SensitiveMatch,
    evidence_of,
)
from complydoc.sensitive.masking import render
from complydoc.sensitive.registry import DetectorUnavailableError, detector_by_id
from complydoc.sensitive.validators import validate

__all__ = ["ScanResult", "UnscannedCategory", "scan", "scan_text"]

# Categories where one run of characters can only be one identifier. Within this
# group overlapping matches are resolved longest-first, so a phone-number pattern
# does not also report the middle of a card number. Categories outside the group
# are independent: a postcode inside a street address is two real findings.
_EXCLUSIVE_GROUP = frozenset(
    {
        "ni_number",
        "sort_code",
        "bank_account_number",
        "iban",
        "card_number",
        "phone_number",
        "date_of_birth",
        "vat_number",
        "utr",
        "international_phone",
        "us_phone",
        "us_ssn",
        "us_ein",
        "us_routing_number",
        "nl_bsn",
        "pt_nif",
        "de_steuer_id",
        "be_national_number",
        "pl_pesel",
        "se_personnummer",
        "dk_cpr",
        "ch_ahv",
        "br_cpf",
        "br_cnpj",
        "in_aadhaar",
        "ca_sin",
        "au_tfn",
    }
)


@dataclass(frozen=True, slots=True)
class Candidate:
    """A validated hit, before overlap resolution and masking."""

    category_id: str
    category: CategoryConfig
    finding: Finding
    validators_passed: list[str]


@dataclass(frozen=True, slots=True)
class UnscannedCategory:
    category: str
    label: str
    reason: str


@dataclass(slots=True)
class ScanResult:
    path: Path
    matches: list[SensitiveMatch] = field(default_factory=list)
    silent: list[SensitiveMatch] = field(default_factory=list)
    """What the silent categories found: covered wherever the text is masked, and in no
    count, finding or check."""
    unscanned_categories: list[UnscannedCategory] = field(default_factory=list)
    unreadable_pages: list[int] = field(default_factory=list)
    """Pages with no text at all, so nothing could be looked for on them."""
    pages_scanned: int = 0
    reveal_used: bool = False
    reveal_blocked_categories: list[str] = field(default_factory=list)
    models_used: dict[str, str] = field(default_factory=dict)
    """Category to the detector and model that answered for it.

    A category can name several detectors, tried in order, so two runs of the
    same documents can be read by different models. A report that did not say
    which would make those two runs look like the same run.
    """

    @property
    def counts_by_category(self) -> dict[str, int]:
        return dict(Counter(m.category for m in self.matches))

    @property
    def counts_by_severity(self) -> dict[str, int]:
        return dict(Counter(m.severity for m in self.matches))

    @property
    def total(self) -> int:
        return len(self.matches)


def _label_near(text: str, finding: Finding, category: CategoryConfig) -> bool:
    """Whether one of the category's context terms sits beside this match.

    `finding.context_term` is only set for a match that needed a label to be
    reported at all. A match from `patterns` is reported on sight, so it carries
    none even when the label is there, and the tier would otherwise read the
    same for `Sort code: 12-34-56` and a delivery note number.
    """
    if finding.context_term:
        return True
    if not category.context_terms:
        return False
    # The same proximity rule the detector applies, asked a second time.
    from complydoc.sensitive.detectors.regex_detector import _nearby_term

    return (
        _nearby_term(
            text,
            finding.start,
            finding.end,
            tuple(category.context_terms),
            category.context_window_chars,
        )
        is not None
    )


def _line_starts(text: str) -> list[int]:
    starts = [0]
    for index, char in enumerate(text):
        if char == "\n":
            starts.append(index + 1)
    return starts


def _locate(starts: list[int], offset: int) -> tuple[int, int]:
    """(1-indexed line, 0-indexed column) for a character offset."""
    line_index = bisect_right(starts, offset) - 1
    return line_index + 1, offset - starts[line_index]


def _resolve_overlaps(
    candidates: list[Candidate],
) -> list[Candidate]:
    """Drop overlapping hits within the mutually exclusive identifier group."""
    exclusive = [c for c in candidates if c.category_id in _EXCLUSIVE_GROUP]
    independent = [c for c in candidates if c.category_id not in _EXCLUSIVE_GROUP]

    # Longest first, so a full card number beats a phone-shaped slice of it. At equal
    # length, a match reported beside its own label wins: "CPR-nummer: 010190-1234"
    # is a Danish CPR number, although the digits also fit a UK phone number.
    exclusive.sort(
        key=lambda c: (
            c.finding.end - c.finding.start,
            c.finding.context_term is not None,
            c.finding.confidence or 0.0,
        ),
        reverse=True,
    )
    accepted: list[Candidate] = []
    taken: list[tuple[int, int]] = []
    for candidate in exclusive:
        span = (candidate.finding.start, candidate.finding.end)
        if any(span[0] < end and start < span[1] for start, end in taken):
            continue
        taken.append(span)
        accepted.append(candidate)

    return accepted + independent


def _scan_page(
    page_number: int,
    text: str,
    config: SensitiveConfig,
    reveal: bool,
    unavailable: dict[str, str],
    models_used: dict[str, str] | None = None,
    silent: list[SensitiveMatch] | None = None,
) -> list[SensitiveMatch]:
    """The page's matches. What its silent categories found goes to `silent`, when given."""
    candidates: list[Candidate] = []

    for category_id, category in config.enabled_categories.items():
        if category_id in unavailable:
            continue
        # A category can name several detectors, tried in order. The shipped
        # configuration prefers a multilingual model and falls back to the small
        # one, so a plain install still finds names. Only when every link fails
        # is the category reported as unscanned, with the last reason given.
        findings: list[Finding] | None = None
        effective = category
        reason = f"no detector named {category.detector!r} is registered"
        for detector_id, link in category.chain():
            engine = detector_by_id(detector_id)
            if engine is None:
                reason = f"no detector named {detector_id!r} is registered"
                continue
            try:
                findings = engine.find(text, DetectorContext(category_id, link))
            except DetectorUnavailableError as exc:
                reason = str(exc)
                continue
            # Detectors include registered plugins and model code. One that fails
            # leaves its category unscanned, and the report says so.
            except Exception as exc:
                reason = f"{type(exc).__name__}: {exc}"
                continue
            effective = link
            if models_used is not None and link.model_backed:
                model = link.model.name if link.model is not None else detector_id
                models_used[category_id] = f"{detector_id}: {model}"
            break

        if findings is None:
            unavailable[category_id] = reason
            continue
        category = effective

        for finding in findings:
            # A detector with no score of its own cannot be filtered on one.
            # It is labelled instead, by its evidence tier.
            if finding.confidence is not None and finding.confidence < category.min_confidence:
                continue
            value = text[finding.start : finding.end]
            passed, names = validate(value, category.validators)
            if not passed:
                continue
            candidates.append(Candidate(category_id, category, finding, names))

    # What is reported is settled among the reported categories alone, as if the silent
    # ones were not there; a silent find is kept only where nothing reported covers it.
    reported = _resolve_overlaps([c for c in candidates if not c.category.silent])
    taken = [(c.finding.start, c.finding.end) for c in reported]
    quiet = [
        c
        for c in _resolve_overlaps([c for c in candidates if c.category.silent])
        if not any(c.finding.start < end and start < c.finding.end for start, end in taken)
    ]
    starts = _line_starts(text)
    matches = _matches(reported, page_number, text, starts, config, reveal)
    if silent is not None:
        silent.extend(_matches(quiet, page_number, text, starts, config, reveal))
    return matches


def _matches(
    candidates: list[Candidate],
    page_number: int,
    text: str,
    starts: list[int],
    config: SensitiveConfig,
    reveal: bool,
) -> list[SensitiveMatch]:
    matches: list[SensitiveMatch] = []
    for candidate in candidates:
        finding = candidate.finding
        value = text[finding.start : finding.end]
        masked, revealed = render(value, candidate.category_id, config.masking, reveal)
        line, column = _locate(starts, finding.start)
        matches.append(
            SensitiveMatch(
                category=candidate.category_id,
                label=candidate.category.label,
                severity=candidate.category.severity,
                page=page_number,
                line=line,
                column=column,
                length=len(value),
                masked=masked,
                revealed=revealed,
                confidence=finding.confidence,
                evidence=evidence_of(
                    candidate.category.model_backed,
                    candidate.validators_passed,
                    finding.context_term,
                    _label_near(text, finding, candidate.category),
                ),
                validators_passed=candidate.validators_passed,
                context_term=finding.context_term,
                fingerprint=identifier_fingerprint(candidate.category_id, value),
            )
        )

    matches.sort(key=lambda m: (m.page, m.line, m.column))
    return matches


def scan_text(
    text: str, config: SensitiveConfig, reveal: bool = False, *, masking: bool = False
) -> tuple[list[SensitiveMatch], dict[str, str]]:
    """Scan a piece of text that is not a page, such as a metadata value.

    With `masking`, what the silent categories found is returned too: the matches are
    for covering the text, not for reporting.

    Returns the matches — located as line and column within `text`, on page 1 —
    and the categories that could not run, with why. Same detectors, same
    validators and the same masking as a page scan, so a finding in metadata is
    judged exactly as it would be in the body of the document.
    """
    unavailable: dict[str, str] = {}
    if not text.strip():
        return [], unavailable
    silent: list[SensitiveMatch] = []
    matches = _scan_page(1, text, config, reveal, unavailable, silent=silent)
    if masking:
        matches = sorted([*matches, *silent], key=lambda m: (m.page, m.line, m.column))
    return matches, _reported(unavailable, config)


def _reported(unavailable: dict[str, str], config: SensitiveConfig) -> dict[str, str]:
    """The categories that could not run and that a report owes a word on: not the silent
    ones, which it was told to say nothing of."""
    return {
        category: reason
        for category, reason in unavailable.items()
        if not (category in config.categories and config.categories[category].silent)
    }


def _prepare(texts: list[str], config: SensitiveConfig) -> None:
    """Let each detector that can read a whole document ahead do so, as one batch.

    A model reads many windows at once far quicker than one at a time. Only the
    first link of a category's chain is asked: it is the one that will run
    unless it cannot, and a detector that fails here fails again on the page,
    where the scan reports why.
    """
    asked: set[tuple[str, str | None]] = set()
    for category_id, category in config.enabled_categories.items():
        detector_id, link = category.chain()[0]
        engine = detector_by_id(detector_id)
        prepare = getattr(engine, "prepare", None)
        key = (detector_id, link.model.name if link.model is not None else None)
        if prepare is None or key in asked:
            continue
        asked.add(key)
        try:
            prepare(texts, DetectorContext(category_id, link))
        except Exception:
            continue


def scan(document: Document, config: SensitiveConfig, reveal: bool = False) -> ScanResult:
    result = ScanResult(path=document.path, reveal_used=reveal)
    unavailable: dict[str, str] = {}
    _prepare([page.text for page in document.pages if page.text.strip()], config)

    for page in document.pages:
        if not page.text.strip():
            result.unreadable_pages.append(page.number)
            continue
        result.pages_scanned += 1
        result.matches.extend(
            _scan_page(
                page.number,
                page.text,
                config,
                reveal,
                unavailable,
                result.models_used,
                silent=result.silent,
            )
        )

    for category_id, reason in _reported(unavailable, config).items():
        category = config.categories.get(category_id)
        result.unscanned_categories.append(
            UnscannedCategory(
                category=category_id,
                label=category.label if category else category_id,
                reason=reason,
            )
        )

    if reveal:
        result.reveal_blocked_categories = [
            c for c in config.masking.never_reveal if c in config.enabled_categories
        ]

    return result
