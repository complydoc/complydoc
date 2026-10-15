"""Evals on your own documents: what a reading of them must contain.

    # .complydoc-evals.yaml
    schema_version: 1
    facts:
      - text: Total due 5,100.00
        document: invoices/2026-03.pdf
      - text: The Supplier shall notify the Customer within 72 hours

A benchmark says how a loader reads someone else's documents. An eval is a passage one
of yours must come out with: a total, a clause, a row of a table. Each is checked
against the text every loader returned, so which loader to use is measured on the
documents it will be used on, and a change of loader that loses one is caught.

A run reads `.complydoc-evals.yaml` at the top of the folder it reads. The file holds
passages as they are written in your documents, so it is as sensitive as they are: keep
it with them.

Matching is `complydoc.extraction.facts`: case, spacing, invisible characters and words
broken at a line end do not matter, and a near miss is scored and shown.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator

from complydoc.extraction.facts import Fact

if TYPE_CHECKING:
    from complydoc.report.models import AuditReport, DocumentReport, EvalSummary

__all__ = [
    "EVALS_FILENAME",
    "EvalError",
    "EvalsFile",
    "ExpectedFact",
    "add_fact",
    "find_evals_file",
    "load_evals",
    "readings_of",
    "remove_fact",
    "score_report",
]

EVALS_FILENAME = ".complydoc-evals.yaml"

_HEADER = """\
# Passages a reading of these documents must contain. Each is checked against the text
# every loader returns: `complydoc audit` and `complydoc compare-loaders` read this file.
# It holds text as your documents write it, so keep it with them.
# Written by `complydoc ui`; edit it by hand as well.
"""


class EvalError(ValueError):
    """The evals file cannot be read, or a fact is not valid."""


class ExpectedFact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    text: str
    """The passage, as the document writes it."""
    document: str | None = None
    """The document it must be in, by name or relative path. Any document when left out."""

    @field_validator("text")
    @classmethod
    def _said(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 3:
            raise ValueError("a fact is at least three characters of a document's text")
        return value

    @field_validator("document")
    @classmethod
    def _named(cls, value: str | None) -> str | None:
        return (value or "").strip() or None

    def as_fact(self) -> Fact:
        return Fact(self.text, self.document)


class EvalsFile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: int = 1
    facts: list[ExpectedFact] = Field(default_factory=list)

    def as_facts(self) -> list[Fact]:
        return [fact.as_fact() for fact in self.facts]


def find_evals_file(target: Path) -> Path | None:
    """The evals file at the top of `target`, when there is one."""
    folder = target if target.is_dir() else target.parent
    candidate = folder / EVALS_FILENAME
    return candidate if candidate.is_file() else None


def load_evals(path: Path) -> EvalsFile:
    """The facts in `path`. An absent file has none."""
    if not path.is_file():
        return EvalsFile()
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise EvalError(f"{path} is not valid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise EvalError(f"{path} must hold a mapping with a `facts` list")
    try:
        return EvalsFile.model_validate(data)
    except ValueError as exc:
        raise EvalError(f"{path} is not a valid evals file:\n{exc}") from exc


def _write(path: Path, facts: list[ExpectedFact]) -> None:
    body = yaml.safe_dump(
        {"schema_version": 1, "facts": [fact.model_dump(exclude_none=True) for fact in facts]},
        sort_keys=False,
        allow_unicode=True,
        width=100,
    )
    path.write_text(_HEADER + body, encoding="utf-8")


def _same(left: ExpectedFact, right: ExpectedFact) -> bool:
    return (left.text.casefold(), left.document) == (right.text.casefold(), right.document)


def add_fact(path: Path, fact: ExpectedFact) -> bool:
    """Add `fact` to the file, creating it. Whether it was not already there."""
    facts = list(load_evals(path).facts)
    if any(_same(fact, existing) for existing in facts):
        return False
    _write(path, [*facts, fact])
    return True


def remove_fact(path: Path, text: str, document: str | None = None) -> bool:
    """Take a fact out of the file. Whether it was there."""
    try:
        wanted = ExpectedFact(text=text, document=document)
    except ValueError:
        return False
    facts = list(load_evals(path).facts)
    kept = [fact for fact in facts if not _same(fact, wanted)]
    if len(kept) == len(facts):
        return False
    _write(path, kept)
    return True


def _readers(report: AuditReport) -> list[str]:
    """Whose readings a run holds: each loader it compared, or an audit's reader and any
    second reader whose text it kept beside it."""
    if report.loader_comparison is not None:
        return [row.name for row in report.loader_comparison.loaders]
    kept = {
        reader for d in report.documents for page in d.extracted_text for reader in page.readings
    }
    others = [r for r in report.run.compare_extractors if r in kept and r != report.run.extractor]
    return [report.run.extractor, *others]


def _as_read_by(document: DocumentReport, reader: str, primary: bool) -> DocumentReport:
    """`document` with each page's text as `reader` read it, from what the run kept.

    A page holds the text of the reader the run was built from, and beside it what any
    other reader made of it. Only that first reader falls back to the page's own text: a
    second reader with no reading of a page read nothing there, and is scored on nothing.
    """

    def text(page: Any) -> str:
        if reader in page.readings:
            return str(page.readings[reader])
        return page.text if primary or page.kept == reader else ""

    pages = [dataclasses.replace(page, text=text(page)) for page in document.extracted_text]
    return dataclasses.replace(document, extracted_text=pages)


def score_report(report: AuditReport, file: Path) -> EvalSummary:
    """The facts in `file` now, checked against the readings `report` already holds.

    Nothing is read again: a run keeps the text each reader produced, and that is what a
    fact is looked for in. So a passage added since the run is scored at once, for every
    reader the run compared. The text kept is the masked text unless the run revealed its
    values, so a passage that holds an identifier is not found in it.
    """
    from complydoc.extraction.facts import evaluate_facts
    from complydoc.report.models import EvalSummary

    if any(d.page_count and not d.extracted_text for d in report.documents):
        raise EvalError(
            "This run kept no text to check against. Run it with the extracted text kept."
        )
    readings = readings_of(report)
    return EvalSummary(
        str(file), list(readings), evaluate_facts(readings, load_evals(file).as_facts())
    )


def readings_of(report: AuditReport) -> dict[str, list[DocumentReport]]:
    """The documents as each reader the run holds read them, from the text it kept."""
    readers = _readers(report)
    return {
        reader: [_as_read_by(d, reader, i == 0) for d in report.documents]
        for i, reader in enumerate(readers)
    }
