"""Which Haystack components are steps of an ingestion pipeline, and of what kind.

Haystack's components share no base class: each is a class its `@component` decorator
remakes with one metaclass, and keeps in a registry. The components that read, split,
clean, embed and write documents are told apart by name, as Haystack and its
integrations name them: `PyPDFToDocument`, `DocumentSplitter`, `DocumentCleaner`,
`OpenAIDocumentEmbedder`, `DocumentWriter`. A text embedder embeds a query, not documents,
and is left alone, as are the components that answer questions.
"""

from __future__ import annotations

import sys
from typing import Final

__all__ = ["components", "kind_of"]

_REGISTRY: Final = "haystack.core.component.component"


def kind_of(cls: type) -> str | None:
    """The kind of step a component class is, or None where it is not one."""
    name = cls.__name__
    if name.endswith("ToDocument") or (
        name.endswith("Converter") and "converter" in cls.__module__
    ):
        return "load"
    if "Splitter" in name or name == "DocumentPreprocessor":
        return "split"
    if name.endswith("DocumentCleaner"):
        return "transform"
    if name.endswith("DocumentEmbedder"):
        return "embed"
    if name.endswith("DocumentWriter"):
        return "store"
    return None


def components(metaclass: type) -> list[type]:
    """The component classes defined so far."""
    module = sys.modules.get(_REGISTRY)
    registry = getattr(getattr(module, "component", None), "registry", None)
    if not isinstance(registry, dict):
        return []
    return [
        cls for cls in registry.values() if isinstance(cls, type) and isinstance(cls, metaclass)
    ]
