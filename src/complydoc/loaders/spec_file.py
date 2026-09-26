"""A loader comparison described in a YAML file, for `complydoc compare-loaders`.

    loaders:
      pymupdf4llm: langchain_pymupdf4llm:PyMuPDF4LLMLoader
      pages:
        loader: langchain_pymupdf4llm:PyMuPDF4LLMLoader
        options: {mode: single}
      docling:
        preset: docling
      word:
        loader: langchain_community.document_loaders:Docx2txtLoader
        formats: [docx]
    paths: ./contracts
    facts:
      - Payment is due within thirty days

A loader is a `module:attribute` reference to a class or function called with each
file path, plus keyword `options`, or a preset from `complydoc.loaders.parsers`.
`formats` limits the files a loader is given, as extensions or format names; see
`complydoc.loaders.formats`.
Relative `paths` and `cache_dir` are resolved from the file's directory.
"""

from __future__ import annotations

import functools
import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from complydoc.audit.run import COMPONENTS
from complydoc.config.loader import ConfigError
from complydoc.config.schema import Config
from complydoc.extraction.facts import FUZZY_THRESHOLD
from complydoc.loaders import parsers
from complydoc.loaders.compare import compare_loaders
from complydoc.report.models import AuditReport
from complydoc.utils.imports import load_object

__all__ = [
    "ComparisonFile",
    "LoaderEntry",
    "build_loaders",
    "compare_from_file",
    "loader_file_types",
    "read_comparison_file",
]

_PRESETS = frozenset(name for name in parsers.__all__ if name != "LoaderSpec")


class LoaderEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    loader: str | None = None
    """`module:attribute` of a class or function called with a file path."""
    preset: str | None = None
    """A preset name from `complydoc.loaders.parsers`."""
    options: dict[str, Any] = Field(default_factory=dict)
    formats: list[str] | None = None
    """The file types the loader is given, such as `[.pdf]` or `[docx, xlsx]`."""

    @model_validator(mode="after")
    def _one_source(self) -> LoaderEntry:
        if (self.loader is None) == (self.preset is None):
            raise ValueError("give exactly one of loader or preset")
        if self.preset is not None and self.preset not in _PRESETS:
            raise ValueError(f"unknown preset {self.preset!r}; choose one of {sorted(_PRESETS)}")
        return self


class ComparisonFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    loaders: dict[str, str | LoaderEntry]
    paths: str | list[str]
    facts: list[str] = Field(default_factory=list)
    fact_threshold: float = FUZZY_THRESHOLD
    allow_network: bool = False
    cache_dir: str | None = None
    components: list[str] = Field(default_factory=lambda: list(COMPONENTS))
    models: list[str] | None = None

    @model_validator(mode="after")
    def _two_loaders(self) -> ComparisonFile:
        if len(self.loaders) < 2:
            raise ValueError("a comparison needs at least two loaders")
        unknown = set(self.components) - set(COMPONENTS)
        if unknown:
            raise ValueError(
                f"unknown components {sorted(unknown)}; choose from {list(COMPONENTS)}"
            )
        return self


def read_comparison_file(path: str | os.PathLike[str]) -> ComparisonFile:
    """The validated contents of a comparison file. Raises `ConfigError` when invalid."""
    source = Path(path).expanduser()
    try:
        data = yaml.safe_load(source.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigError(f"cannot read {source}: {exc}") from exc
    try:
        return ComparisonFile.model_validate(data)
    except ValueError as exc:
        raise ConfigError(f"{source} is invalid:\n{exc}") from exc


def loader_file_types(spec: ComparisonFile) -> dict[str, list[str]]:
    """The file types each loader that names them is given."""
    return {
        name: value.formats
        for name, value in spec.loaders.items()
        if isinstance(value, LoaderEntry) and value.formats is not None
    }


def build_loaders(spec: ComparisonFile) -> dict[str, Any]:
    """Loader factories and presets by name, imported."""
    built: dict[str, Any] = {}
    for name, value in spec.loaders.items():
        entry = LoaderEntry(loader=value) if isinstance(value, str) else value
        if entry.preset is not None:
            built[name] = getattr(parsers, entry.preset)(**entry.options)
            continue
        assert entry.loader is not None
        target = load_object(entry.loader)
        built[name] = functools.partial(target, **entry.options) if entry.options else target
    return built


def compare_from_file(
    path: str | os.PathLike[str],
    *,
    config: Config | None = None,
    verify_with: str | None = None,
    verify_scope: str = "flagged",
) -> AuditReport:
    """Run the comparison a file describes, verified by a vision model when one is named."""
    source = Path(path).expanduser().resolve()
    spec = read_comparison_file(source)

    def resolve(value: str) -> Path:
        candidate = Path(value).expanduser()
        return candidate if candidate.is_absolute() else source.parent / candidate

    paths = [resolve(p) for p in ([spec.paths] if isinstance(spec.paths, str) else spec.paths)]
    return compare_loaders(
        build_loaders(spec),
        paths=paths[0] if len(paths) == 1 else paths,
        config=config,
        components=spec.components,
        models=spec.models,
        allow_network=spec.allow_network,
        facts=spec.facts or None,
        fact_threshold=spec.fact_threshold,
        cache_dir=resolve(spec.cache_dir) if spec.cache_dir else None,
        verify_with=verify_with,
        verify_scope=verify_scope,
        formats=loader_file_types(spec) or None,
    )
