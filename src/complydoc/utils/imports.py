"""Importing an object named as `module:attribute`, and a package of modules."""

from __future__ import annotations

import importlib
import pkgutil
from collections.abc import Collection
from typing import Any

__all__ = ["import_package_modules", "load_object"]


def load_object(reference: str) -> Any:
    """The object `reference` names, such as `package.module:Class` or `module:func.attr`."""
    module_name, separator, attribute = reference.partition(":")
    if not separator or not module_name or not attribute:
        raise ValueError(f"expected module:attribute, got {reference!r}")
    target: Any = importlib.import_module(module_name)
    for part in attribute.split("."):
        try:
            target = getattr(target, part)
        except AttributeError as exc:
            raise ValueError(f"{module_name} has no attribute {attribute!r}") from exc
    return target


def import_package_modules(package: str, skip: Collection[str] = ()) -> None:
    """Import every module in `package`, so anything they register is registered.

    The four registries each held their own copy of this loop. They still hold
    their own "already done" flag, because each registry is discovered the first
    time something asks it for what it has.
    """
    found = importlib.import_module(package)
    for info in pkgutil.iter_modules(found.__path__):
        if info.name in skip:
            continue
        importlib.import_module(f"{package}.{info.name}")
