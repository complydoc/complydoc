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
) -> list[SensitiveMatch]:
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

    starts = _line_starts(text)
    matches: list[SensitiveMatch] = []
    for candidate in _resolve_overlaps(candidates):
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
            )
        )

    matches.sort(key=lambda m: (m.page, m.line, m.column))
    return matches


def scan_text(
    text: str, config: SensitiveConfig, reveal: bool = False
) -> tuple[list[SensitiveMatch], dict[str, str]]:
    """Scan a piece of text that is not a page, such as a metadata value.

    Returns the matches — located as line and column within `text`, on page 1 —
    and the categories that could not run, with why. Same detectors, same
    validators and the same masking as a page scan, so a finding in metadata is
    judged exactly as it would be in the body of the document.
    """
    unavailable: dict[str, str] = {}
    if not text.strip():
        return [], unavailable
    return _scan_page(1, text, config, reveal, unavailable), unavailable


def scan(document: Document, config: SensitiveConfig, reveal: bool = False) -> ScanResult:
    result = ScanResult(path=document.path, reveal_used=reveal)
    unavailable: dict[str, str] = {}

    for page in document.pages:
        if not page.text.strip():
            result.unreadable_pages.append(page.number)
            continue
        result.pages_scanned += 1
        result.matches.extend(
            _scan_page(page.number, page.text, config, reveal, unavailable, result.models_used)
        )

    for category_id, reason in unavailable.items():
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
