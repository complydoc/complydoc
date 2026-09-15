"""complydoc steps as LangChain document transformers.

from complydoc.integrations.langchain import as_transformer

transformer = as_transformer(cd.MaskIdentifiers())
documents = transformer.transform_documents(documents)
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from complydoc.pipeline.steps import Step

__all__ = ["as_transformer"]


def as_transformer(step: Step) -> Any:
    """`step` as a `langchain_core` `BaseDocumentTransformer`."""
    try:
        from langchain_core.documents import BaseDocumentTransformer
    except ImportError as exc:
        raise ImportError(
            "as_transformer needs langchain-core: pip install langchain-core"
        ) from exc

    class ComplydocTransformer(BaseDocumentTransformer):  # type: ignore[misc]
        def __init__(self, wrapped: Step) -> None:
            self.step = wrapped

        def transform_documents(self, documents: Sequence[Any], **kwargs: Any) -> list[Any]:
            return self.step.transform_documents(documents, **kwargs)

        async def atransform_documents(self, documents: Sequence[Any], **kwargs: Any) -> list[Any]:
            return await self.step.atransform_documents(documents, **kwargs)

    return ComplydocTransformer(step)
