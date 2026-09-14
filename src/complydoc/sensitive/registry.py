"""Detector registry.

Adding a detector means adding one file under `detectors/` with an `@detector`
decorated class, and pointing a category at it by name in sensitive.yaml.
"""

from __future__ import annotations

import importlib
import pkgutil
from typing import Final, TypeVar

from complydoc.sensitive.base import Detector

__all__ = ["DetectorUnavailableError", "all_detectors", "detector", "detector_by_id", "register"]

_DETECTORS: Final[dict[str, Detector]] = {}
_discovered = False

T = TypeVar("T", bound=type)


class DetectorUnavailableError(RuntimeError):
    """A detector cannot run — usually an optional model that is not installed.

    Raised so the scan reports the category as unscanned.
    """


def _add(instance: Detector) -> None:
    if not isinstance(instance, Detector):
        raise TypeError(f"{type(instance).__name__} does not satisfy the Detector protocol")
    if instance.id in _DETECTORS:
        raise ValueError(f"duplicate detector id {instance.id!r}")
    _DETECTORS[instance.id] = instance


def detector(cls: T) -> T:
    """Class decorator for the built-in detectors. Instantiates and registers by id."""
    _add(cls())
    return cls


def register(instance: Detector) -> Detector:
    """Add an identifier detector to this process.

    A category uses it when its `detector` is this detector's id; add the category
    to `sensitive.categories`, for example with `Config.override`.
    """
    _discover()
    _add(instance)
    return instance


def _discover() -> None:
    global _discovered
    if _discovered:
        return
    _discovered = True
    package = importlib.import_module("complydoc.sensitive.detectors")
    for info in pkgutil.iter_modules(package.__path__):
        importlib.import_module(f"complydoc.sensitive.detectors.{info.name}")


def all_detectors() -> list[Detector]:
    _discover()
    return list(_DETECTORS.values())


def detector_by_id(detector_id: str) -> Detector | None:
    _discover()
    return _DETECTORS.get(detector_id)
