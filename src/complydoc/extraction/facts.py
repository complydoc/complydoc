"""Checking that expected facts appear in extracted text.

    report = cd.full_audit("./invoices", extracted_text=True)
    checks = cd.check_facts(report, [cd.Fact("Total due 5,100.00", document="invoice.pdf")])

A fact is a short passage you expect a document to contain. Matching ignores case,
whitespace, invisible characters and words split by a hyphen at a line break. When
the passage is not found exactly, the most similar run of words is scored from 0 to 1,
and a score at or above the threshold counts as a fuzzy match.

`compare_loaders(..., facts=...)` runs the same check on every loader's text.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import PurePath

from complydoc.hidden.unicode import strip_invisible
from complydoc.report.models import AuditReport, DocumentReport, FactCheck
from complydoc.utils.text import MAX_WORDS

__all__ = ["FUZZY_THRESHOLD", "Fact", "as_facts", "check_facts", "evaluate_facts", "find_fact"]

FUZZY_THRESHOLD = 0.9

_HYPHEN_BREAK = re.compile(r"(\w)-[ \t]*\n[ \t]*(\w)")


@dataclass(frozen=True, slots=True)
class Fact:
    """A passage a document is expected to contain."""

    text: str
    document: str | None = None
    """File name or relative path to check. None checks every document."""


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
                match = _find_reported(pairs, fact.text, threshold)
                if match.score > best.score or (match.kind == "exact" and best.kind != "exact"):
                    best, where = match, document.relative_path
                if best.kind == "exact":
                    break
            found[name] = best.kind
            scores[name] = best.score
            pages[name] = best.page
            located[name] = where if best.kind else None
            nearest[name] = best.passage if best.kind != "exact" else None
        checks.append(
            FactCheck(
                fact=fact.text,
                document=fact.document,
                found=found,
                scores=scores,
                pages=pages,
                documents=located,
                nearest=nearest,
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
