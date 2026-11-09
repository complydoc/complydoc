"""complydoc steps as Haystack components.

from complydoc.integrations.haystack import as_component

pipeline.add_component("mask", as_component(cd.MaskIdentifiers()))
pipeline.connect("splitter.documents", "mask.documents")
"""

# No `from __future__ import annotations`: Haystack reads a component's sockets from the
# types `run` is annotated with, and a string is not a type it can connect.
import functools
from typing import Any

from complydoc.pipeline.steps import Step

__all__ = ["as_component"]


def as_component(step: Step) -> Any:
    """`step` as a `haystack` component: documents in, documents out."""
    return _component()(step)


@functools.cache
def _component() -> Any:
    """The component class, made once: Haystack registers each class it is given."""
    try:
        from haystack import Document, component
    except ImportError as exc:
        raise ImportError("as_component needs haystack-ai: pip install haystack-ai") from exc

    @component
    class ComplydocComponent:
        def __init__(self, step: Step) -> None:
            self.step = step

        @component.output_types(documents=list[Document])  # type: ignore[untyped-decorator,unused-ignore]
        def run(self, documents: list[Document]) -> dict[str, list[Document]]:
            return {"documents": self.step.transform_documents(documents)}

        @component.output_types(documents=list[Document])  # type: ignore[untyped-decorator,unused-ignore]
        async def run_async(self, documents: list[Document]) -> dict[str, list[Document]]:
            return {"documents": await self.step.atransform_documents(documents)}

    return ComplydocComponent
