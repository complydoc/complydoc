"""Which extractors exist.

Adding one means adding a module in this package that calls `register`. The
package is walked at import time, so there is no central list to edit — the same
arrangement the readiness signals and the sensitive detectors use.
"""

from __future__ import annotations

from typing import Final

from complydoc.ingest.extractors.base import Extractor
from complydoc.utils.imports import import_package_modules

__all__ = ["DEFAULT_EXTRACTOR", "all_extractors", "extractor_by_id", "register"]

DEFAULT_EXTRACTOR: Final = "pdfplumber"
"""The richest of them: a box per word, and it finds ruled tables."""

_EXTRACTORS: Final[dict[str, Extractor]] = {}
_discovered = False


def register(cls: type) -> type:
    """Class decorator. Instantiates the extractor once and registers it by id.

    The same arrangement the signals use, so the two read alike.
    """
    instance = cls()
    if not isinstance(instance, Extractor):  # pragma: no cover - programming error
        raise TypeError(f"{cls.__name__} does not satisfy the Extractor protocol")
    if instance.id in _EXTRACTORS:
        raise ValueError(f"duplicate extractor id {instance.id!r}")
    _EXTRACTORS[instance.id] = instance
    return cls


def _discover() -> None:
    global _discovered
    if _discovered:
        return
    _discovered = True
    import_package_modules("complydoc.ingest.extractors", skip={"base", "registry"})


def all_extractors() -> list[Extractor]:
    _discover()
    return [_EXTRACTORS[key] for key in sorted(_EXTRACTORS)]


def extractor_by_id(extractor_id: str) -> Extractor | None:
    _discover()
    return _EXTRACTORS.get(extractor_id)
