"""Signal registry.

Adding a signal means adding one file under `signals/` with an `@signal`
decorated class. The package is walked at import time, so there is no central
list and no switch statement to edit.
"""

from __future__ import annotations

import importlib
import pkgutil
from typing import Final, TypeVar

from complydoc.readiness.base import Signal

__all__ = ["all_signals", "register", "signal", "signal_by_id"]

_SIGNALS: Final[dict[str, Signal]] = {}
_discovered = False

T = TypeVar("T", bound=type)


def _add(instance: Signal) -> None:
    if not isinstance(instance, Signal):
        raise TypeError(f"{type(instance).__name__} does not satisfy the Signal protocol")
    if instance.id in _SIGNALS:
        raise ValueError(f"duplicate signal id {instance.id!r}")
    _SIGNALS[instance.id] = instance


def signal(cls: T) -> T:
    """Class decorator for the built-in signals. Instantiates and registers by id."""
    _add(cls())
    return cls


def register(instance: Signal) -> Signal:
    """Add a readiness signal to every run in this process.

    The signal is measured and shown unrated until `readiness.signals.<id>` is
    configured, for example with `Config.override`.
    """
    _discover()
    _add(instance)
    return instance


def _discover() -> None:
    global _discovered
    if _discovered:
        return
    _discovered = True
    package = importlib.import_module("complydoc.readiness.signals")
    for info in pkgutil.iter_modules(package.__path__):
        importlib.import_module(f"complydoc.readiness.signals.{info.name}")


def all_signals() -> list[Signal]:
    _discover()
    return list(_SIGNALS.values())


def signal_by_id(signal_id: str) -> Signal | None:
    _discover()
    return _SIGNALS.get(signal_id)
