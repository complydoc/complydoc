"""Detector registry.

Adding a detector means adding one file under `detectors/` with an `@detector`
decorated class, and pointing a category at it by name in sensitive.yaml.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final, TypeVar

from complydoc.sensitive.base import Detector

if TYPE_CHECKING:  # pragma: no cover - type-checking imports only
    from complydoc.config.schema import SensitiveConfig
from complydoc.utils.imports import import_package_modules

__all__ = [
    "DetectorUnavailableError",
    "all_detectors",
    "detector",
    "detector_by_id",
    "models_for_detector",
    "register",
]

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
    import_package_modules("complydoc.sensitive.detectors")


def all_detectors() -> list[Detector]:
    _discover()
    return list(_DETECTORS.values())


def detector_by_id(detector_id: str) -> Detector | None:
    _discover()
    return _DETECTORS.get(detector_id)


def models_for_detector(config: SensitiveConfig, detector_id: str) -> list[str]:
    """Every model an enabled category names for `detector_id`, in order.

    Every link of a chain, not just the first: a category names the detectors to
    try in order, and a model further down one is still configured.
    """
    names: list[str] = []
    for category in config.enabled_categories.values():
        for found, link in category.chain():
            if found == detector_id and link.model is not None:
                names.extend(link.model.model_names())
    return list(dict.fromkeys(names))
