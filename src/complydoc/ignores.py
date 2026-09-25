"""The ignore file: findings a person looked at and decided are not a problem.

    # .complydoc-ignore.yaml
    schema_version: 1
    ignores:
      - finding: id-3f2a9c1e0b7d4e55
        reason: Our own company bank account, printed on every invoice.
        by: Duarte Cardoso
        what: IBAN ending 6819
        paths: ["invoices/*"]
        until: 2027-01-01

`finding` is a fingerprint (see `complydoc.fingerprint`), which the report gives
every identifier and every hidden or instruction-like passage. `reason` is
required: an ignore nobody can explain is a finding nobody checked. `paths`
limits it to documents whose relative path matches one of the globs, and
`until` ends it, after which the finding is counted again and the report says
the ignore expired.

A run reads `.complydoc-ignore.yaml` at the top of the folder it audits, or the
file given with `--ignore-file`. Ignored findings stay in the report, under each
document's `ignored`, and leave every count, limitation, quick win and policy
rule. The file holds fingerprints and words, never a value.
"""

from __future__ import annotations

import datetime as dt
import getpass
import subprocess
from collections.abc import Iterable
from fnmatch import fnmatch
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator

from complydoc.report.models import (
    DocumentReport,
    IgnoredFinding,
    IgnoreRule,
    IgnoreSummary,
)

__all__ = [
    "IGNORE_FILENAME",
    "IgnoreEntry",
    "IgnoreError",
    "IgnoreFile",
    "add_ignore",
    "apply_ignores",
    "find_ignore_file",
    "load_ignores",
    "remove_ignore",
    "who",
]

IGNORE_FILENAME = ".complydoc-ignore.yaml"

_HEADER = """\
# Findings complydoc should set aside, each with the reason it is not a problem.
# `finding` is a fingerprint from a report; it never contains the value found.
# `paths` limits an entry to documents matching a glob, `until` ends it.
# Written by `complydoc ignore` and `complydoc ui`; edit it by hand as well.
"""


class IgnoreError(ValueError):
    """The ignore file cannot be read, or an entry is not valid."""


class IgnoreEntry(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    finding: str
    reason: str
    by: str | None = None
    what: str | None = None
    paths: list[str] = Field(default_factory=list)
    until: dt.date | None = None
    added: dt.date | None = None

    @field_validator("finding")
    @classmethod
    def _fingerprint(cls, value: str) -> str:
        value = value.strip()
        prefix, _, digest = value.partition("-")
        if prefix not in ("id", "ct") or len(digest) != 16:
            raise ValueError(
                f"{value!r} is not a fingerprint; a report gives each finding one, "
                "such as id-3f2a9c1e0b7d4e55"
            )
        return value

    @field_validator("reason")
    @classmethod
    def _reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("an ignore needs a reason")
        return value.strip()

    def applies_to(self, relative_path: str) -> bool:
        return not self.paths or any(fnmatch(relative_path, glob) for glob in self.paths)

    def expired_on(self, today: dt.date) -> bool:
        return self.until is not None and today > self.until


class IgnoreFile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: int = 1
    ignores: list[IgnoreEntry] = Field(default_factory=list)


def find_ignore_file(target: Path) -> Path | None:
    """The ignore file at the top of `target`, when there is one."""
    folder = target if target.is_dir() else target.parent
    candidate = folder / IGNORE_FILENAME
    return candidate if candidate.is_file() else None


def load_ignores(path: Path) -> IgnoreFile:
    """The entries in `path`. An absent file has none."""
    if not path.is_file():
        return IgnoreFile()
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise IgnoreError(f"{path} is not valid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise IgnoreError(f"{path} must hold a mapping with an `ignores` list")
    try:
        return IgnoreFile.model_validate(data)
    except ValueError as exc:
        raise IgnoreError(f"{path} is not a valid ignore file:\n{exc}") from exc


def _write(path: Path, ignores: Iterable[IgnoreEntry]) -> None:
    entries = []
    for entry in ignores:
        # In field order, `finding` and `reason` first, so the file reads as a
        # list of decisions.
        data = entry.model_dump(exclude_none=True)
        if not data["paths"]:
            del data["paths"]
        entries.append(data)
    body = yaml.safe_dump(
        {"schema_version": 1, "ignores": entries}, sort_keys=False, allow_unicode=True, width=88
    )
    path.write_text(_HEADER + body, encoding="utf-8")


def add_ignore(path: Path, entry: IgnoreEntry) -> bool:
    """Add `entry` to the file at `path`, creating it. True when it replaced one.

    An entry for the same fingerprint and the same paths is replaced, so ignoring
    a finding again updates the reason rather than listing it twice. Comments in
    the file other than the header are not kept.
    """
    current = load_ignores(path).ignores
    kept = [e for e in current if (e.finding, e.paths) != (entry.finding, entry.paths)]
    _write(path, [*kept, entry])
    return len(kept) != len(current)


def remove_ignore(path: Path, finding: str) -> int:
    """Remove every entry for `finding`. The number removed."""
    current = load_ignores(path).ignores
    kept = [e for e in current if e.finding != finding]
    if len(kept) != len(current):
        _write(path, kept)
    return len(current) - len(kept)


def who() -> str:
    """The name to record as `by`: git's user.name, else the login name."""
    try:
        name = subprocess.run(
            ["git", "config", "user.name"], capture_output=True, text=True, timeout=5, check=False
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        name = ""
    return name or getpass.getuser()


def apply_ignores(
    documents: list[DocumentReport], path: Path, ignores: IgnoreFile, today: dt.date
) -> IgnoreSummary:
    """Move each ignored finding out of its document's findings into `ignored`.

    Done before anything is counted, so ignored findings leave every total and
    rule at once. An expired entry sets nothing aside.
    """
    matched = [0] * len(ignores.ignores)

    def rule_for(fingerprint: str, relative_path: str) -> int | None:
        for index, entry in enumerate(ignores.ignores):
            if (
                entry.finding == fingerprint
                and not entry.expired_on(today)
                and entry.applies_to(relative_path)
            ):
                return index
        return None

    def set_aside(index: int, fingerprint: str, kind: str) -> IgnoredFinding:
        matched[index] += 1
        entry = ignores.ignores[index]
        return IgnoredFinding(
            fingerprint=fingerprint,
            kind=kind,
            reason=entry.reason,
            by=entry.by,
            until=entry.until.isoformat() if entry.until else None,
        )

    for document in documents:
        if document.sensitive is not None:
            kept = []
            for match in document.sensitive.matches:
                index = rule_for(match.fingerprint, document.relative_path)
                if index is None:
                    kept.append(match)
                    continue
                ignored = set_aside(index, match.fingerprint, "identifier")
                ignored.identifier = match
                document.ignored.append(ignored)
            document.sensitive.matches = kept
        kept_content = []
        for finding in document.content_findings:
            index = rule_for(finding.fingerprint, document.relative_path)
            if index is None:
                kept_content.append(finding)
                continue
            ignored = set_aside(index, finding.fingerprint, "content")
            ignored.content = finding
            document.ignored.append(ignored)
        document.content_findings = kept_content

    return IgnoreSummary(
        file=str(path),
        rules=[
            IgnoreRule(
                finding=entry.finding,
                reason=entry.reason,
                by=entry.by,
                until=entry.until.isoformat() if entry.until else None,
                paths=list(entry.paths),
                what=entry.what,
                added=entry.added.isoformat() if entry.added else None,
                matched=matched[index],
                expired=entry.expired_on(today),
            )
            for index, entry in enumerate(ignores.ignores)
        ],
    )
