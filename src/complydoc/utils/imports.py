"""Importing an object named as `module:attribute`."""

from __future__ import annotations

import importlib
from typing import Any

__all__ = ["load_object"]


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
