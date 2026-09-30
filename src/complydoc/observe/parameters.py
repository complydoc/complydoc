"""A component's settings, as a stage records them.

Read from the component's attributes, never from the arguments of the call, which
hold the documents. A LangChain splitter keeps its settings in private attributes
(`_chunk_size`), so a leading underscore is dropped from the name.
"""

from __future__ import annotations

import enum
import re
from pathlib import PurePath
from typing import Any, Final

from complydoc.loaders.inspection import ABSOLUTE_PATH

__all__ = ["parameters_of"]

_SECRET: Final = re.compile(r"key|token|secret|passw|credential|auth|cookie|header", re.I)
"""Names of settings left out whatever they hold."""

_LONGEST: Final = 200
"""Longer strings are left out: a setting that long is more likely text than a setting."""

_ITEMS: Final = 20

_NOT_SETTINGS: Final = frozenset({"changes"})
"""Attributes that record what a component did rather than how it is set:
complydoc's own steps keep their `changes` there."""

_SKIP: Final = object()


def parameters_of(component: Any) -> dict[str, Any]:
    """The component's settings that are plain values, by name, secrets left out."""
    # A class method's component is the class, whose attributes are its code, not settings.
    if component is None or isinstance(component, type):
        return {}
    fields = getattr(type(component), "model_fields", None)
    if isinstance(fields, dict):
        source = {name: getattr(component, name, None) for name in fields}
    else:
        source = dict(getattr(component, "__dict__", {}))

    values: dict[str, Any] = {}
    for raw, value in source.items():
        name = raw.lstrip("_")
        if not name or name in values or name in _NOT_SETTINGS or _SECRET.search(name):
            continue
        plain = _plain(value)
        if plain is not _SKIP:
            values[name] = plain
    return dict(sorted(values.items()))


def _plain(value: Any, nested: bool = False) -> Any:
    if value is None or isinstance(value, bool | int | float):
        return value
    if type(value).__name__ in ("SecretStr", "SecretBytes"):
        return _SKIP
    if isinstance(value, enum.Enum):
        return _plain(value.value, nested)
    if isinstance(value, PurePath):
        return value.name
    if isinstance(value, str):
        # A path names the account and folders it came from; the file's name is enough.
        if ABSOLUTE_PATH.match(value):
            return PurePath(value).name
        return value if len(value) <= _LONGEST else _SKIP
    if isinstance(value, list | tuple) and not nested and len(value) <= _ITEMS:
        items = [_plain(item, nested=True) for item in value]
        return _SKIP if any(item is _SKIP for item in items) else items
    if callable(value) and not nested:
        # `length_function=len` says how chunks are measured.
        return getattr(value, "__name__", _SKIP)
    return _SKIP
