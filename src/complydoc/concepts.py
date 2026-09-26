"""Custom concepts: your own things to look for, described in words.

    # .complydoc-concepts.yaml
    schema_version: 1
    concepts:
      - id: tariff_engine_id
        label: Tariff engine ID
        description: An identifier from our insurance tariff engine.
        pattern: 'TE-\\d{4}-\\d{5}'
        severity: high

A concept with a `pattern` is looked for in every audit, like any identifier:
found by the pattern, masked, fingerprinted, counted, and open to an ignore.
The description says what it is, for the report and for whoever reads the file.

A concept with `judge: true` is also put to a judgement model, page by page,
with its description as the question, so one with no pattern, or one a pattern
cannot pin down, can still be found. That sends page text off the machine, so it
happens only on a run that asks for it (`--judge-concepts jev`) and the report
names where the text went.

A run reads `.complydoc-concepts.yaml` at the top of the folder it audits, or
the file `--concepts` names.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from complydoc.config.schema import CategoryConfig, Config

__all__ = [
    "CONCEPTS_FILENAME",
    "CONCEPT_PREFIX",
    "JUDGE_THRESHOLD",
    "Concept",
    "ConceptError",
    "ConceptFile",
    "ConceptJudge",
    "find_concepts_file",
    "judge_pages",
    "load_concepts",
    "register_concept_judge",
    "registered_concept_judge",
    "remove_concept",
    "resolve_concept_judge",
    "save_concept",
    "with_concepts",
]

ConceptJudge = Callable[[str, str, str], float]
"""Given a concept's label and description and a page's text: the chance the page holds it."""

JUDGE_THRESHOLD = 0.5
"""The score at which a judged page is reported as containing the concept."""

JUDGES = ("jev",)
"""The judges a run can name. A judge of your own is registered from Python."""

CONCEPTS_FILENAME = ".complydoc-concepts.yaml"

CONCEPT_PREFIX = "concept_"
"""What a concept's identifier category is named by: `concept_tariff_engine_id`."""

_HEADER = """\
# Your own things for complydoc to look for, each described in words.
# `pattern` finds it on every run; `judge: true` also asks a judgement model,
# page by page, on runs with --judge-concepts (which sends page text off the machine).
# Written by `complydoc ui`; edit it by hand as well.
"""

_ID = re.compile(r"^[a-z][a-z0-9_]{0,47}$")


class ConceptError(ValueError):
    """The concepts file cannot be read, or a concept is not valid."""


class Concept(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    label: str
    description: str
    pattern: str | None = None
    severity: Literal["low", "medium", "high"] = "medium"
    judge: bool = False

    @field_validator("id")
    @classmethod
    def _id(cls, value: str) -> str:
        if not _ID.match(value):
            raise ValueError(
                f"{value!r} is not a concept id: lower-case letters, digits and "
                "underscores, starting with a letter"
            )
        return value

    @field_validator("label", "description")
    @classmethod
    def _words(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("a concept needs a label and a description")
        return value.strip()

    @field_validator("pattern")
    @classmethod
    def _pattern(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        try:
            compiled = re.compile(value)
        except re.error as exc:
            raise ValueError(f"the pattern is not a valid regular expression: {exc}") from exc
        if compiled.match(""):
            raise ValueError("the pattern matches empty text, so it would match everywhere")
        return value

    @model_validator(mode="after")
    def _findable(self) -> Concept:
        if self.pattern is None and not self.judge:
            raise ValueError(
                f"{self.label!r} has neither a pattern nor judge: true, so nothing would find it"
            )
        return self

    @property
    def category(self) -> str:
        return f"{CONCEPT_PREFIX}{self.id}"


class ConceptFile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: int = 1
    concepts: list[Concept] = Field(default_factory=list)

    @model_validator(mode="after")
    def _unique(self) -> ConceptFile:
        ids = [concept.id for concept in self.concepts]
        repeated = sorted({i for i in ids if ids.count(i) > 1})
        if repeated:
            raise ValueError(f"concept ids must be unique; repeated: {', '.join(repeated)}")
        return self


def find_concepts_file(target: Path) -> Path | None:
    """The concepts file at the top of `target`, when there is one."""
    folder = target if target.is_dir() else target.parent
    candidate = folder / CONCEPTS_FILENAME
    return candidate if candidate.is_file() else None


def load_concepts(path: Path) -> ConceptFile:
    """The concepts in `path`. An absent file has none."""
    if not path.is_file():
        return ConceptFile()
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ConceptError(f"{path} is not valid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ConceptError(f"{path} must hold a mapping with a `concepts` list")
    try:
        return ConceptFile.model_validate(data)
    except ValueError as exc:
        raise ConceptError(f"{path} is not a valid concepts file:\n{exc}") from exc


def _write(path: Path, concepts: Iterable[Concept]) -> None:
    entries = []
    for concept in concepts:
        data = concept.model_dump(exclude_none=True)
        if not data.get("judge"):
            data.pop("judge", None)
        entries.append(data)
    body = yaml.safe_dump(
        {"schema_version": 1, "concepts": entries}, sort_keys=False, allow_unicode=True, width=88
    )
    path.write_text(_HEADER + body, encoding="utf-8")


def save_concept(path: Path, concept: Concept) -> bool:
    """Add `concept` to the file, or replace the one with its id. True when it replaced one."""
    current = load_concepts(path).concepts
    replaced = any(c.id == concept.id for c in current)
    kept = [concept if c.id == concept.id else c for c in current]
    _write(path, kept if replaced else [*kept, concept])
    return replaced


def remove_concept(path: Path, concept_id: str) -> bool:
    """Remove the concept with this id. Whether there was one."""
    current = load_concepts(path).concepts
    kept = [c for c in current if c.id != concept_id]
    if len(kept) != len(current):
        _write(path, kept)
    return len(kept) != len(current)


def with_concepts(config: Config, concepts: ConceptFile) -> Config:
    """`config`, looking for each concept with a pattern as an identifier category of its own.

    The config's digest changes with the concepts, since two runs that looked for
    different things are not the same run.
    """
    categories = {
        concept.category: CategoryConfig(
            label=concept.label,
            region="custom",
            detector="regex",
            severity=concept.severity,
            patterns=[concept.pattern],
            gdpr_note=concept.description,
        )
        for concept in concepts.concepts
        if concept.pattern is not None
    }
    if not concepts.concepts:
        return config
    sensitive = config.sensitive.model_copy(
        update={"categories": {**config.sensitive.categories, **categories}}
    )
    described = json.dumps([c.model_dump() for c in concepts.concepts], sort_keys=True)
    digest = hashlib.sha256(f"{config.digest}\n{described}".encode()).hexdigest()[:16]
    return config.model_copy(update={"sensitive": sensitive, "digest": digest})


_judge: ConceptJudge | None = None


def register_concept_judge(judge: ConceptJudge | None) -> None:
    """Judge concepts with `judge` in this process, or stop with None."""
    global _judge
    _judge = judge


def registered_concept_judge() -> ConceptJudge | None:
    return _judge


def resolve_concept_judge(spec: str) -> ConceptJudge:
    """The judge a run names: `jev`, which sends page text to TypeSafe."""
    if spec != "jev":
        raise ConceptError(f"no concept judge named {spec!r}; the one there is: jev")
    from complydoc.integrations.typesafe import jev_concept_judge

    try:
        return jev_concept_judge(allow_network=True)
    except (ValueError, ImportError) as exc:
        raise ConceptError(f"cannot use the {spec} judge: {exc}") from exc


def judge_pages(
    pages: Iterable[tuple[int, str]],
    concepts: Iterable[Concept],
    judge: ConceptJudge,
    found: set[tuple[str, int]],
) -> tuple[list[tuple[Concept, int, float]], int]:
    """Each page a judge says holds a concept, and how many questions failed.

    Only concepts marked `judge` are asked about. A page where the concept's
    pattern already found it is not asked again: the answer is known, and every
    question sends the page off the machine. `found` holds (category, page) for
    what the patterns found. A question that fails is counted, not scored: a
    service that is down must not read as a page that is clean.
    """
    judged = [concept for concept in concepts if concept.judge]
    hits: list[tuple[Concept, int, float]] = []
    failures = 0
    for number, text in pages:
        if not text.strip():
            continue
        for concept in judged:
            if (concept.category, number) in found:
                continue
            try:
                score = judge(concept.label, concept.description, text)
            except Exception:
                failures += 1
                continue
            if score >= JUDGE_THRESHOLD:
                hits.append((concept, number, round(score, 3)))
    return hits, failures
