"""complydoc steps as LlamaIndex transform components.

from complydoc.integrations.llamaindex import as_transform

pipeline = IngestionPipeline(transformations=[splitter, as_transform(cd.MaskIdentifiers())])
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from complydoc.steps import Step

__all__ = ["as_transform"]


def as_transform(step: Step) -> Any:
    """`step` as a `llama_index.core` `TransformComponent`."""
    try:
        from llama_index.core.schema import TransformComponent
    except ImportError as exc:
        raise ImportError(
            "as_transform needs llama-index-core: pip install llama-index-core"
        ) from exc

    class ComplydocTransform(TransformComponent):  # type: ignore[misc]
        def __call__(self, nodes: Sequence[Any], **kwargs: Any) -> list[Any]:
            return step(nodes, **kwargs)

    return ComplydocTransform()
