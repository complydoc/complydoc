"""Which identifier categories a run looks for, and how serious each one is.

    # .complydoc-categories.yaml
    schema_version: 1
    categories:
      us_zip_code:
        enabled: false
      organisation_name:
        severity: low

Only what differs from the shipped configuration is written: a category left out of the
file is looked for as it ships, so the file does not drift from the defaults as
complydoc changes them. `enabled: false` stops a category being looked for at all; the
report says so, so a run that finds none of it is not read as a clean one. `severity`
changes how serious a finding of the category is called.

A run reads `.complydoc-categories.yaml` at the top of the folder it audits, or the file
`--categories` names. Your own things to look for are concepts, in their own file.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from complydoc.config.schema import Config

__all__ = [
    "CATEGORIES_FILENAME",
    "CategoriesApplied",
    "CategoryChange",
    "CategoryError",
    "CategoryFile",
    "effective",
    "find_categories_file",
    "load_categories",
    "reset_category",
    "save_category",
    "with_categories",
]

CATEGORIES_FILENAME = ".complydoc-categories.yaml"

_HEADER = """\
# Identifier categories changed from complydoc's own settings; the rest are as shipped.
# `enabled: false` stops a category being looked for, and the report says so.
# `severity` is how serious a finding of the category is called.
# Written by `complydoc ui`; edit it by hand as well.
"""


class CategoryError(ValueError):
    """The categories file cannot be read, or a change is not valid."""


class CategoryChange(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    enabled: bool | None = None
    severity: Literal["low", "medium", "high"] | None = None

    @model_validator(mode="after")
    def _something(self) -> CategoryChange:
        if self.enabled is None and self.severity is None:
            raise ValueError("a change sets `enabled`, `severity`, or both")
        return self


class CategoryFile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: int = 1
    categories: dict[str, CategoryChange] = Field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class CategoriesApplied:
    """What `with_categories` found: each change made, and each name it did not know."""

    changed: dict[str, CategoryChange]
    unknown: list[str]


def find_categories_file(target: Path) -> Path | None:
    """The categories file at the top of `target`, when there is one."""
    folder = target if target.is_dir() else target.parent
    candidate = folder / CATEGORIES_FILENAME
    return candidate if candidate.is_file() else None


def load_categories(path: Path) -> CategoryFile:
    """The changes in `path`. An absent file has none."""
    if not path.is_file():
        return CategoryFile()
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise CategoryError(f"{path} is not valid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise CategoryError(f"{path} must hold a mapping with a `categories` mapping")
    try:
        return CategoryFile.model_validate(data)
    except ValueError as exc:
        raise CategoryError(f"{path} is not a valid categories file:\n{exc}") from exc


def _write(path: Path, categories: Mapping[str, CategoryChange]) -> None:
    body = yaml.safe_dump(
        {
            "schema_version": 1,
            "categories": {
                name: change.model_dump(exclude_none=True)
                for name, change in sorted(categories.items())
            },
        },
        sort_keys=False,
        allow_unicode=True,
    )
    path.write_text(_HEADER + body, encoding="utf-8")


def save_category(path: Path, name: str, change: CategoryChange, config: Config) -> None:
    """Change category `name` as `change` says, keeping the file to what differs from `config`.

    A setting the same as the shipped one is dropped, and a category left with nothing
    changed is removed from the file, so the file holds only real differences.
    """
    shipped = config.sensitive.categories.get(name)
    if shipped is None:
        raise CategoryError(f"{name!r} is not an identifier category")
    current = load_categories(path).categories
    before = current.get(name)
    enabled = change.enabled if change.enabled is not None else (before.enabled if before else None)
    severity = (
        change.severity if change.severity is not None else (before.severity if before else None)
    )
    kept = {
        "enabled": None if enabled in (None, shipped.enabled) else enabled,
        "severity": None if severity in (None, shipped.severity) else severity,
    }
    categories = {n: c for n, c in current.items() if n != name}
    if any(value is not None for value in kept.values()):
        categories[name] = CategoryChange.model_validate(kept)
    _write(path, categories)


def reset_category(path: Path, name: str) -> bool:
    """Put category `name` back as it ships. Whether the file changed it."""
    current = load_categories(path).categories
    if name not in current:
        return False
    _write(path, {n: c for n, c in current.items() if n != name})
    return True


def effective(config: Config, file: CategoryFile) -> list[dict[str, object]]:
    """Every shipped category as a run with `file` would look for it, and how it differs."""
    rows: list[dict[str, object]] = []
    for name, category in config.sensitive.categories.items():
        change = file.categories.get(name)
        enabled = None if change is None else change.enabled
        severity = None if change is None else change.severity
        rows.append(
            {
                "id": name,
                "label": category.label,
                "region": category.region,
                "detector": category.detector,
                "model_backed": category.model_backed,
                "enabled": category.enabled if enabled is None else enabled,
                "severity": category.severity if severity is None else severity,
                "shipped_enabled": category.enabled,
                "shipped_severity": category.severity,
            }
        )
    return rows


def with_categories(config: Config, file: CategoryFile) -> tuple[Config, CategoriesApplied]:
    """`config` with `file`'s changes made, and what was changed.

    The config's digest changes with them, since two runs that looked for different
    things are not the same run. A name the config has no category of is reported, not
    fatal: a typo in this file should not stop an audit.
    """
    known = config.sensitive.categories
    unknown = sorted(name for name in file.categories if name not in known)
    changed = {name: change for name, change in file.categories.items() if name in known}
    if not changed:
        return config, CategoriesApplied({}, unknown)
    updated = {}
    for name, change in changed.items():
        fields = {k: v for k, v in change.model_dump().items() if v is not None}
        updated[name] = known[name].model_copy(update=fields)
    sensitive = config.sensitive.model_copy(update={"categories": {**known, **updated}})
    described = json.dumps({n: c.model_dump() for n, c in sorted(changed.items())}, sort_keys=True)
    digest = hashlib.sha256(f"{config.digest}\n{described}".encode()).hexdigest()[:16]
    return (
        config.model_copy(update={"sensitive": sensitive, "digest": digest}),
        CategoriesApplied(changed, unknown),
    )
