"""Types for the sensitive data scan.

Detectors return spans. Only `masking.render` turns a span into readable text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Final, Literal, Protocol, runtime_checkable

from complydoc.config.schema import CategoryConfig

__all__ = [
    "EVIDENCE_ORDER",
    "SEVERITY_WEIGHT",
    "Detector",
    "DetectorContext",
    "Evidence",
    "Finding",
    "SensitiveMatch",
    "evidence_of",
    "not_a_name",
    "not_an_organisation",
    "numbered_heading",
]

Evidence = Literal["confirmed", "corroborated", "pattern", "model"]
"""How strong the case for a finding is.

Four tiers, strongest first:

`confirmed`
    A checksum passed. A card number that satisfies Luhn is a card number.
`corroborated`
    The shape matched and a label sits next to it — "IBAN:", "Sort code".
`pattern`
    The shape matched and nothing else confirms it. Nine digits in a row are
    nine digits in a row.
`model`
    A statistical model named it. No checksum exists for a person's name, so
    this is the strongest evidence available for such a category and the
    weakest evidence in the list. Expect both misses and false positives.
"""


@dataclass(frozen=True, slots=True)
class Finding:
    """A candidate span within one page's text. Carries no value."""

    start: int
    end: int
    confidence: float | None = 1.0
    """The detector's own score, or None where the detector has none to give."""
    context_term: str | None = None
    """Set when a generic pattern was only reported because of a nearby label."""


@dataclass(frozen=True, slots=True)
class DetectorContext:
    """Everything a detector is given about the category it is running for."""

    category_id: str
    config: CategoryConfig


@dataclass(frozen=True, slots=True)
class SensitiveMatch:
    """One reported hit. `revealed` is None unless --reveal was passed."""

    category: str
    label: str
    severity: str
    page: int
    line: int
    column: int
    length: int
    masked: str
    revealed: str | None = None
    evidence: Evidence = "pattern"
    """How strong the case for this finding is — see `Evidence`."""
    confidence: float | None = 1.0
    """The detector's own score, where the detector produces one.

    None for a detector that produces none. A statistical model that cannot
    report a score has not scored 1.0, and recording it as such put a guess and
    a passed checksum side by side as equals.
    """
    validators_passed: list[str] = field(default_factory=list)
    context_term: str | None = None
    """The nearby label that justified reporting a generic pattern."""
    fingerprint: str = ""
    """The same for this value in every document and run; see `complydoc.fingerprint`.

    What an ignore file names. Empty in reports written before it existed.
    """


SEVERITY_WEIGHT: Final[dict[str, int]] = {"high": 3, "medium": 2, "low": 1}
"""How the three severities compare, for sorting and for scoring exposure.

One table, because it was two: a fourth severity added to the config would
otherwise have to be remembered in the report as well as in the score. What to
do with a severity that is not in it differs by caller — last when sorting, not
free when scoring — so each says so where it asks.
"""

EVIDENCE_ORDER: Final = ("confirmed", "corroborated", "pattern", "model")
"""Strongest first. The order the security page sorts by within a severity."""


def numbered_heading(span: str) -> bool:
    """Whether `span` is capitals ending in a bare number: `CONDITIONS 4`, `SCHEDULE 2.`.

    Read as flat text, a heading runs into the number of the clause that follows it, and a
    name model takes the pair for an organisation. A name written in capitals does not end
    in a number standing alone, and one in mixed case, such as `Channel 4`, is left be.
    """
    words = span.split()
    if len(words) < 2 or not words[-1].rstrip(".").isdigit():
        return False
    letters = [c for c in span if c.isalpha()]
    return bool(letters) and all(c.isupper() for c in letters)


# Words a person's name does not start with: the street, clause or form label a model
# reads as the first name of a two-word "name" (`Rua Augusta`, `Cláusula Terceira`,
# `Fatura Simplificada`). Seven languages, as the identifier labels.
_NOT_A_FIRST_NAME = re.compile(
    r"(?i)^(?:rua|avenida|av|largo|travessa|pra[cç]a|estrada|alameda|calle|avenue|via|rue|"
    r"street|road|strasse|straße|weg|straat|cl[áa]usula|artigo|art|tribunal|entre|contrato|"
    r"fatura|factura|facture|rechnung|fattura|factuur|refer[êe]ncia|morada|qualquer|section|"
    r"clause|article|artikel|invoice|total|valor|data|nome|name|nombre|nom|dear|caro|cara|"
    r"estimado|estimada|exmo|exma)$"
)
# Words that make a run of capitals an organisation rather than a person, wherever they
# stand in it: `Ribeira Software`, `Tribunal da Comarca`, `Bluefin Retail Ltd`.
_ORGANISATION_WORD = re.compile(
    r"(?i)^(?:lda|ltd|limited|llc|inc|corp|plc|gmbh|ag|sa|sl|srl|bv|nv|spa|sarl|software|"
    r"solutions|consulting|group|grupo|holding|bank|banco|banque|tribunal|comarca|"
    r"universidade|university|associa[cç][ãa]o|cooperativa|seguros|insurance|services|"
    r"servi[cç]os|retail|technologies|tecnologia)$"
)
_NAME_PARTICLES = frozenset(
    {"da", "de", "do", "dos", "das", "e", "van", "von", "der", "den", "la", "le", "del",
     "di", "du", "y", "dei", "ten", "ter", "bin", "al"}
)  # fmt: skip


def not_a_name(span: str, min_words: int = 1) -> bool:
    """Whether a span a model read as a person's name cannot be one by its shape.

    A name has no digits, every word but a particle (`da`, `van`) starts with a capital,
    it does not start with a street, clause or form word, and it holds no company word.
    In capitals, it has two to four words. The small English model reads Portuguese and Spanish
    text badly, and most of its wrong names fail one of these: "transferência para",
    "Rua Augusta", "Ribeira Software", "CONTRATO".
    """
    name = span.strip(" \t,.;:")
    words = name.split()
    if len(words) < max(min_words, 1) or any(c.isdigit() for c in name):
        return True
    if _NOT_A_FIRST_NAME.match(words[0].rstrip(".")):
        return True
    if any(_ORGANISATION_WORD.match(word.strip(".,")) for word in words):
        return True
    if name.isupper():
        # A name in capitals heads a CV or a signature block: `RITA ALMEIDA SOUSA`. A
        # heading in capitals is one word, or longer than a name, or starts with its
        # form's word, which the checks above already caught.
        return not 2 <= len(words) <= 4
    return not all(word[:1].isupper() or word.lower() in _NAME_PARTICLES for word in words)


def not_an_organisation(span: str) -> bool:
    """Whether a span a model read as an organisation cannot be one by its shape.

    It starts in lower case or runs past six words (a phrase from a sentence: "aprovada em
    conselho de administração"), it holds a code of three or more digits ("Ticket
    OPS-21674", "CAE 89692"), or it is a heading in capitals with no company word in it
    ("MEDICAL LETTER", "FORMAÇÃO"). "ACME LTD" stays.
    """
    name = span.strip(" \t,.;:")
    words = name.split()
    if not words or not words[0][:1].isupper() or len(words) > 6:
        return True
    if any(sum(c.isdigit() for c in word) >= 3 for word in words):
        return True
    return name.isupper() and not any(_ORGANISATION_WORD.match(word.strip(".,")) for word in words)


def evidence_of(
    model_backed: bool,
    validators_passed: list[str],
    context_term: str | None,
    label_nearby: bool = False,
) -> Evidence:
    """The tier a finding earned from the checks it passed.

    `label_nearby` says one of the category's context terms sits within the
    window of the match. A match from `patterns` carries no `context_term` even
    when its label is right beside it, so without this a labelled sort code and
    a bare one would be told apart by nothing.

    `model_backed` says a statistical model named this rather than a pattern
    matching it. It is passed as the fact rather than as a detector's name: a
    detector registered by a caller is no more a pattern match than the one
    that ships, and keying on the name reported its findings as `pattern`.
    """
    from complydoc.sensitive.validators import FORMAT_ONLY

    # A checksum is close to proof. A shape check is not, whatever it is called,
    # so a format-only validator earns its tier from the label beside it.
    if any(name not in FORMAT_ONLY for name in validators_passed):
        return "confirmed"
    if context_term or label_nearby:
        return "corroborated"
    if model_backed:
        return "model"
    return "pattern"


@runtime_checkable
class Detector(Protocol):
    """Finds spans of one kind in a page's text.

    A detector may also define `prepare(texts, context)`, called with every page
    of a document before the first `find`, to read them all ahead in one batch.
    """

    id: str

    def find(self, text: str, context: DetectorContext) -> list[Finding]: ...
