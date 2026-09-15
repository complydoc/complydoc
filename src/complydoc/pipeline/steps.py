"""Pipeline steps that act on what complydoc finds.

    steps = [cd.StripPathMetadata(), cd.DropHiddenPassages(), cd.MaskIdentifiers()]
    for step in steps:
        documents = step.transform_documents(documents)

A step takes LangChain documents, LlamaIndex nodes, mappings with `page_content` or
`text`, or strings, and returns copies with their text or metadata changed. The
originals are not modified. `step.changes` records what each call changed.

LangChain pipelines call `transform_documents`; LlamaIndex pipelines call the step
with nodes. `complydoc.integrations.langchain.as_transformer` and
`complydoc.integrations.llamaindex.as_transform` wrap a step in each framework's
base class.
"""

from __future__ import annotations

import asyncio
import copy
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from complydoc.config.schema import Config
from complydoc.extraction.strings import mask_text, resolve_config
from complydoc.hidden.check import instruction_spans
from complydoc.hidden.unicode import strip_invisible
from complydoc.loaders.inspection import ABSOLUTE_PATH, SOURCE_KEYS, document_content
from complydoc.utils.text import count

__all__ = ["DropHiddenPassages", "MaskIdentifiers", "Step", "StepChange", "StripPathMetadata"]

_MIN_MASKABLE = 4


@dataclass(frozen=True, slots=True)
class StepChange:
    step: str
    document: str | None
    """The source named in the document's metadata."""
    detail: str


class Step:
    """Base class: subclasses implement `apply` on one document's text and metadata."""

    name = "step"

    def __init__(self, *, config: Config | None = None) -> None:
        self.config = config
        self.changes: list[StepChange] = []

    def apply(self, text: str, metadata: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
        """The new text and metadata, or None to drop the document."""
        raise NotImplementedError

    def transform_documents(self, documents: Sequence[Any], **kwargs: Any) -> list[Any]:
        result = []
        for document in documents:
            text, metadata = document_content(document)
            applied = self.apply(text, dict(metadata))
            if applied is None:
                continue
            new_text, new_metadata = applied
            unchanged = new_text == text and new_metadata == metadata
            result.append(document if unchanged else _rebuild(document, new_text, new_metadata))
        return result

    async def atransform_documents(self, documents: Sequence[Any], **kwargs: Any) -> list[Any]:
        return await asyncio.to_thread(self.transform_documents, documents, **kwargs)

    def __call__(self, nodes: Sequence[Any], **kwargs: Any) -> list[Any]:
        return self.transform_documents(nodes, **kwargs)

    def _record(self, metadata: Mapping[str, Any], detail: str) -> None:
        source = next((str(metadata[k]) for k in SOURCE_KEYS if metadata.get(k)), None)
        self.changes.append(StepChange(self.name, source, detail))


class MaskIdentifiers(Step):
    """Replaces identifiers in the text, and in string metadata values when `metadata`."""

    name = "mask_identifiers"

    def __init__(self, *, metadata: bool = True, config: Config | None = None) -> None:
        super().__init__(config=config)
        self.metadata = metadata

    def apply(self, text: str, metadata: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        masked = mask_text(text, config=self.config)
        replaced = masked.masked
        if self.metadata:
            for key, value in metadata.items():
                if isinstance(value, str) and sum(c.isalnum() for c in value) >= _MIN_MASKABLE:
                    result = mask_text(value, config=self.config)
                    if result.masked:
                        metadata[key] = result.text
                        replaced += result.masked
        if replaced:
            self._record(metadata, f"masked {count(replaced, 'identifier')}")
        if masked.unscanned:
            self._record(metadata, "not scanned: " + ", ".join(sorted(masked.unscanned)))
        return masked.text, metadata


class DropHiddenPassages(Step):
    """Removes invisible characters and instruction-like sentences from the text.

    With `drop_document`, a document containing either is dropped instead. This works
    on text: hidden formatting in the source file is detected by an audit, not here.
    Invisible characters include zero-width joiners, which some scripts use.
    """

    name = "drop_hidden_passages"

    def __init__(self, *, drop_document: bool = False, config: Config | None = None) -> None:
        super().__init__(config=config)
        self.drop_document = drop_document

    def apply(self, text: str, metadata: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
        clean = strip_invisible(text)
        invisible = len(text) - len(clean)
        spans = instruction_spans(clean, resolve_config(self.config))
        if not invisible and not spans:
            return text, metadata
        if self.drop_document:
            self._record(metadata, "dropped the document")
            return None
        for start, end in reversed(spans):
            clean = clean[:start] + clean[end:]
        details = []
        if invisible:
            details.append(f"removed {count(invisible, 'invisible character')}")
        if spans:
            details.append(f"removed {count(len(spans), 'instruction-like sentence')}")
        self._record(metadata, "; ".join(details))
        return clean, metadata


class StripPathMetadata(Step):
    """Replaces absolute file paths in metadata values with the file name."""

    name = "strip_path_metadata"

    def apply(self, text: str, metadata: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        keys = [k for k, v in metadata.items() if isinstance(v, str) and ABSOLUTE_PATH.match(v)]
        for key in keys:
            metadata[key] = re.split(r"[\\/]", metadata[key].rstrip("\\/"))[-1]
        if keys:
            self._record(metadata, "replaced paths in " + ", ".join(sorted(keys)))
        return text, metadata


def _rebuild(document: Any, text: str, metadata: dict[str, Any]) -> Any:
    """A copy of `document` with new text and metadata, keeping its type."""
    if isinstance(document, str):
        return text
    if isinstance(document, Mapping):
        key = "page_content" if "page_content" in document else "text"
        return {**document, key: text, "metadata": metadata}
    field = "page_content" if hasattr(document, "page_content") else "text"
    model_copy = getattr(document, "model_copy", None)
    if callable(model_copy):
        return model_copy(update={field: text, "metadata": metadata})
    duplicate = copy.copy(document)
    setattr(duplicate, field, text)
    duplicate.metadata = metadata
    return duplicate
