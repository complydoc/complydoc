"""Checking that expected facts appear in extracted text.

    report = cd.full_audit("./invoices", extracted_text=True)
    checks = cd.check_facts(report, [cd.Fact("Total due 5,100.00", document="invoice.pdf")])

A fact is a short passage you expect a document to contain. Matching ignores case,
whitespace, invisible characters and words split by a hyphen at a line break. When
the passage is not found exactly, the most similar run of words is scored from 0 to 1,
and a score at or above the threshold counts as a fuzzy match.

Two other kinds of fact are checked the same way and scored on the same scale:

    cd.Fact("78,500.00", kind="value", label="Total due")   # the number, however grouped
    cd.Fact("Note for the AI", kind="absent")                # a passage that must not be read

A check's `found` says whether the fact held: `exact` when it did, `fuzzy` for a near
miss, None when it did not. For a passage that must not appear, holding is not being found.

`compare_loaders(..., facts=...)` runs the same check on every loader's text.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from pathlib import PurePath

from complydoc.hidden.unicode import strip_invisible
from complydoc.report.models import AuditReport, DocumentReport, FactCheck
from complydoc.utils.text import MAX_WORDS

__all__ = [
    "FACT_KINDS",
    "FUZZY_THRESHOLD",
    "Fact",
    "as_facts",
    "check_facts",
    "evaluate_facts",
    "find_fact",
    "find_value",
]

FUZZY_THRESHOLD = 0.9

FACT_KINDS = ("text", "value", "absent")
"""A passage that must be read, a number that must be, and a passage that must not be."""

LABEL_REACH = 12
"""Words after a value's label it may be found in: next to it, or a table cell or two along."""

_HYPHEN_BREAK = re.compile(r"(\w)-[ \t]*\n[ \t]*(\w)")


@dataclass(frozen=True, slots=True)
class Fact:
    """A passage a document is expected to contain."""

    text: str
    document: str | None = None
    """File name or relative path to check. None checks every document."""
    kind: str = "text"
    """`text`, a passage the reading must hold; `value`, a number it must hold however it
    is grouped; `absent`, a passage it must not hold."""
    label: str | None = None
    """For a value, the words it follows, such as `Total due`."""

    def __post_init__(self) -> None:
        if self.kind not in FACT_KINDS:
            raise ValueError(f"a fact's kind is one of {', '.join(FACT_KINDS)}, not {self.kind!r}")
        if self.kind == "value" and not _value_readings(self.text):
            raise ValueError(f"{self.text!r} is not a number")
        if self.label is not None and self.kind != "value":
            raise ValueError("only a value has a label")


@dataclass(frozen=True, slots=True)
class Match:
    kind: str | None
    """`exact`, `fuzzy`, or None when not found."""
    score: float
    page: int | None
    passage: str | None = None
    """The run of words that came closest, when the fact was not found exactly.

    A score says a reading missed; the passage says how. A fact split by a
    two-column page reads as two clauses spliced together, and showing that is
    what makes the miss make sense.
    """


def as_facts(facts: Iterable[Fact | str]) -> list[Fact]:
    """Facts from `Fact` objects or plain strings."""
    result: list[Fact] = []
    for fact in facts:
        if isinstance(fact, str):
            fact = Fact(fact)
        elif not isinstance(fact, Fact):
            raise TypeError(f"a fact is a Fact or a string, not {type(fact).__name__}")
        if not fact.text.strip():
            raise ValueError("a fact cannot be empty")
        result.append(fact)
    return result


def _tidy(text: str) -> str:
    """Invisible characters, line-break hyphens and extra spaces removed, case kept."""
    text = unicodedata.normalize("NFKC", strip_invisible(text)).replace("­", "")
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    return " ".join(text.split())


def normalise(text: str) -> str:
    """Casefolded text with invisible characters, line-break hyphens and extra spaces removed."""
    return _tidy(text).casefold()


def find_fact(
    pages: Sequence[tuple[int | None, str]], text: str, threshold: float = FUZZY_THRESHOLD
) -> Match:
    """Where `text` appears in `pages`, given as (page number, text)."""
    target = normalise(text)
    size = len(target.split())
    best = Match(None, 0.0, None)
    matcher = difflib.SequenceMatcher(autojunk=False)
    matcher.set_seq2(target)

    for number, page_text in pages:
        tidy = _tidy(page_text)
        haystack = tidy.casefold()
        if target in haystack:
            return Match("exact", 1.0, number)
        words = haystack.split()[:MAX_WORDS]
        # The same words as the page wrote them, index for index: casefolding
        # changes letters and never where a word ends.
        shown = tidy.split()[:MAX_WORDS]
        for width in sorted({max(1, size - 1), size, size + 1}):
            for start in range(max(1, len(words) - width + 1)):
                matcher.set_seq1(" ".join(words[start : start + width]))
                if matcher.real_quick_ratio() <= best.score or matcher.quick_ratio() <= best.score:
                    continue
                ratio = matcher.ratio()
                if ratio > best.score:
                    passage = " ".join(shown[start : start + width])
                    best = Match(None, round(ratio, 4), number, passage)

    if best.score >= threshold:
        return Match("fuzzy", best.score, best.page, best.passage)
    return Match(None, best.score, None, best.passage)


_NUMBER = re.compile(
    r"(?<![\d.,])"
    r"(?:\d{1,3}(?P<group>[ \u00a0\u202f.,'\u2019])\d{3}(?:(?P=group)\d{3})*(?:[.,]\d+)?"
    r"|\d+(?:[.,]\d+)?)"
    r"(?![\d])"
)


def _readings(token: str) -> frozenset[Decimal]:
    """The numbers `token` can be read as.

    `1,234` is a thousand and more in one locale and a little over one in another, so
    it is read both ways; `78,500.00` and `78.500,00` are read only as the same amount.
    Digits split by a space or an apostrophe are always thousands.
    """
    match = _NUMBER.fullmatch(token)
    if not match:
        return frozenset()
    group = match["group"]
    readings: set[Decimal] = set()
    tail = re.search(r"[.,](\d+)$", token)
    if group is None:
        if tail is None:
            return frozenset({Decimal(token)})
        whole = token[: tail.start()]
        readings.add(Decimal(f"{whole}.{tail[1]}"))
        if len(tail[1]) == 3 and len(whole) <= 3:
            readings.add(Decimal(whole + tail[1]))
        return frozenset(readings)
    body, fraction = token, ""
    if tail is not None and token[tail.start()] != group:
        body, fraction = token[: tail.start()], tail[1]
    elif tail is not None and len(tail[1]) != 3:
        return frozenset()
    digits = body.replace(group, "")
    readings.add(Decimal(f"{digits}.{fraction}" if fraction else digits))
    if not fraction and group in ".," and body.count(group) == 1:
        whole, part = body.split(group)
        readings.add(Decimal(f"{whole}.{part}"))
    return frozenset(readings)


def _value_readings(value: str) -> frozenset[Decimal]:
    """What an expected value can be read as, with any currency or sign around it left out."""
    found = [m.group() for m in _NUMBER.finditer(value)]
    return _readings(found[0]) if found and len(found) == 1 else frozenset()


_SPACES = " \u00a0\u202f"


def _numbers(text: str) -> list[tuple[int, int, frozenset[Decimal]]]:
    """Each number in `text`: where it starts, where it ends, and what it can be read as.

    Digits grouped by spaces are also read part by part: in a table row, `3 283,33` is as
    likely a quantity and a price as one amount.
    """
    found = []
    for m in _NUMBER.finditer(text):
        found.append((m.start(), m.end(), _readings(m.group())))
        if m["group"] is not None and m["group"] in _SPACES:
            for part in re.finditer(r"\S+", m.group()):
                start = m.start() + part.start()
                found.append((start, start + len(part.group()), _readings(part.group())))
    return found


def _around(text: str, start: int, end: int, words: int = 6) -> str:
    before = text[:start].split()[-words:]
    after = text[end:].split()[:words]
    return " ".join([*before, text[start:end], *after])


def find_value(
    pages: Sequence[tuple[int | None, str]], value: str, label: str | None = None
) -> Match:
    """Where the number `value` appears in `pages`, and whether by its label.

    Exact when it is within `LABEL_REACH` words after the label, or anywhere when there
    is no label; fuzzy when the number is there but not by the label. When it is missing,
    the passage is the words that follow the label, which is what the reading has
    where the value should be.
    """
    wanted = _value_readings(value)
    marker = normalise(label) if label else None
    elsewhere: Match | None = None
    after_label: Match | None = None
    for number, page_text in pages:
        tidy = _tidy(page_text)
        folded = tidy.casefold()
        found = [(start, end) for start, end, read in _numbers(tidy) if read & wanted]
        if marker is None:
            if found:
                return Match("exact", 1.0, number)
            continue
        at = folded.find(marker)
        while at != -1:
            if at and folded[at - 1].isalnum():
                at = folded.find(marker, at + 1)
                continue
            reach_end = at + len(marker)
            # `tidy` holds single spaces, so the words after the label end here.
            limit = reach_end + len(" ".join(tidy[reach_end:].split()[:LABEL_REACH])) + 1
            if any(reach_end <= start and end <= limit for start, end in found):
                return Match("exact", 1.0, number)
            if after_label is None:
                after_label = Match(None, 0.0, number, tidy[at:limit].strip())
            at = folded.find(marker, at + 1)
        if found and elsewhere is None:
            start, end = found[0]
            elsewhere = Match("fuzzy", 0.5, number, _around(tidy, start, end))
    if elsewhere is not None:
        return elsewhere
    return after_label or Match(None, 0.0, None)


def _applies(document: DocumentReport, name: str | None) -> bool:
    if name is None:
        return True
    return name in {
        document.relative_path,
        PurePath(document.relative_path).name,
        str(document.path),
        document.path.name,
    }


@lru_cache(maxsize=256)
def _as_reported(text: str) -> str:
    """The fact as a report's masked page text would show it.

    A report's page text has its identifiers masked, so a fact that is, or holds,
    an identifier, such as an email address a loader should keep, is never in
    it as written. Masked the same way, it is. Masking uses the default configuration:
    a report written with a different mask length matches only the unmasked form.
    """
    # Imported here: extract builds on the audit, which builds on the report.
    from complydoc.config.loader import load_config
    from complydoc.extraction.extract import mask_matches
    from complydoc.sensitive.scanner import scan_text

    matches, _unavailable = scan_text(text, load_config().sensitive, reveal=False)
    return mask_matches(text, matches)[0]


_MASK = "\u2022"
_MASK_RUN = re.compile(f"{_MASK}+")
_MIN_SHOWN = 0.5
"""Share of a fact's characters a masked page must still show for the fact to be found in it."""


def _find_under_masks(pages: Sequence[tuple[int | None, str]], text: str) -> Match | None:
    """Where `text` is on a page that covers part of it with a mask.

    A report keeps a dot for each character of an identifier, so a passage that
    holds one, or a word a name model took for a name, is not in the text as
    written. It is found where every character the page still shows is the
    passage's own, as long as the page shows at least half of them: a passage
    hidden almost whole could be anything.
    """
    target = normalise(text)
    if not target:
        return None
    for number, page_text in pages:
        haystack = normalise(page_text)
        if _MASK not in haystack:
            continue
        tried: set[int] = set()
        for run in _MASK_RUN.finditer(haystack):
            first = max(0, run.start() - len(target) + 1)
            last = min(run.end() - 1, len(haystack) - len(target))
            for start in range(first, last + 1):
                if start in tried:
                    continue
                tried.add(start)
                window = haystack[start : start + len(target)]
                shown = sum(1 for have in window if have != _MASK)
                if shown >= _MIN_SHOWN * len(target) and all(
                    have in (want, _MASK) for have, want in zip(window, target, strict=True)
                ):
                    return Match("exact", 1.0, number)
    return None


def _find_reported(pages: Sequence[tuple[int | None, str]], text: str, threshold: float) -> Match:
    """`find_fact` against page text that may be masked."""
    match = find_fact(pages, text, threshold)
    if match.kind == "exact":
        return match
    under = _find_under_masks(pages, text)
    if under is not None:
        return under
    masked = _as_reported(text)
    if masked == text:
        return match
    other = find_fact(pages, masked, threshold)
    return other if other.score > match.score else match


def evaluate_facts(
    documents: Mapping[str, Sequence[DocumentReport]],
    facts: Sequence[Fact],
    threshold: float = FUZZY_THRESHOLD,
) -> list[FactCheck]:
    """Each fact against each named set of documents, such as one set per loader."""
    checks: list[FactCheck] = []
    for fact in facts:
        found: dict[str, str | None] = {}
        scores: dict[str, float] = {}
        pages: dict[str, int | None] = {}
        located: dict[str, str | None] = {}
        nearest: dict[str, str | None] = {}
        for name, candidates in documents.items():
            best, where = Match(None, 0.0, None), None
            for document in candidates:
                if not _applies(document, fact.document):
                    continue
                pairs = [(page.number, page.text) for page in document.extracted_text]
                if fact.kind == "value":
                    match = find_value(pairs, fact.text, fact.label)
                else:
                    match = _find_reported(pairs, fact.text, threshold)
                better = match.score > best.score or (
                    match.kind == "exact" and best.kind != "exact"
                )
                # A value not found still says what follows its label: keep the first such.
                if better or (where is None and match.passage and not best.passage):
                    best, where = match, document.relative_path
                if best.kind == "exact":
                    break
            held = best.kind
            if fact.kind == "absent":
                # Not finding it is the pass; a near copy of it is a near miss.
                held = {"exact": None, "fuzzy": "fuzzy", None: "exact"}[best.kind]
            found[name] = held
            scores[name] = 1.0 - best.score if fact.kind == "absent" else best.score
            pages[name] = best.page if best.kind else None
            located[name] = where if best.kind else None
            nearest[name] = best.passage if held != "exact" and best.kind != "exact" else None
        checks.append(
            FactCheck(
                fact=fact.text,
                document=fact.document,
                found=found,
                scores=scores,
                pages=pages,
                documents=located,
                nearest=nearest,
                kind=fact.kind,
                label=fact.label,
            )
        )
    return checks


def check_facts(
    report: AuditReport,
    facts: Iterable[Fact | str],
    *,
    threshold: float = FUZZY_THRESHOLD,
) -> list[FactCheck]:
    """Whether each fact appears in the report's extracted text.

    The report must have been produced with `extracted_text=True`. Results are keyed
    by the loader's name for loader output, and by `report` otherwise.
    """
    if any(d.page_count and not d.extracted_text for d in report.documents):
        raise ValueError("check_facts needs a report produced with extracted_text=True")
    name = report.loader.name if report.loader else "report"
    return evaluate_facts({name: report.documents}, as_facts(facts), threshold)
