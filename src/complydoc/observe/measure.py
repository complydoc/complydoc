"""What a stage's items weigh and cost, and the few of them the viewer shows.

Tokens are counted with the headline model's encoding, the one the rest of the report
counts with, so a step's tokens and a document's read the same. An embedding step is
priced from the price table's embedding models, by the model its settings name; one the
table does not list is left unpriced rather than guessed. A step that reached no host ran
here, and costs nothing to run.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path, PurePath
from typing import TYPE_CHECKING, Any, Final

from complydoc.config.schema import Config
from complydoc.cost.price_table import embedding_price
from complydoc.cost.tokenizer import count_tokens
from complydoc.extraction.extract import tokenizer_for
from complydoc.extraction.strings import mask_text
from complydoc.loaders.inspection import ABSOLUTE_PATH, SOURCE_KEYS
from complydoc.report.models import StagePreview

if TYPE_CHECKING:
    from complydoc.observe.session import Recording

__all__ = ["Measurer"]

_MODEL_KEYS: Final = ("model", "model_name", "deployment", "deployment_name", "model_id")
"""Settings an embedding class names its model under."""

_TEXT: Final = 600
"""Characters of an item's text kept in a preview."""

_VALUE: Final = 120
_KEYS: Final = 12


class Measurer:
    def __init__(self, settings: Config, *, reveal: bool, previews: int, root: Path | None) -> None:
        self.settings = settings
        self.reveal = reveal
        self.previews = previews
        self.root = root
        self._spec = tokenizer_for(settings, None)
        self._counted: dict[str, int] = {}

    def tokens(self, texts: Sequence[str]) -> int:
        """Tokens in `texts`, each distinct text counted once."""
        total = 0
        for text in texts:
            if text not in self._counted:
                self._counted[text] = count_tokens(text, self._spec).tokens
            total += self._counted[text]
        return total

    @staticmethod
    def model(recording: Recording) -> str | None:
        """The model a stage names in its settings, such as an embedding model's."""
        return next(
            (str(recording.parameters[k]) for k in _MODEL_KEYS if recording.parameters.get(k)),
            None,
        )

    def cost(self, recording: Recording, tokens_in: int | None) -> tuple[float | None, str | None]:
        """What an embedding step cost, and on what basis; nothing for any other step."""
        if recording.kind != "embed":
            return None, None
        if not recording.connections:
            return 0.0, "local"
        model = self.model(recording)
        price = embedding_price(model) if model else None
        if price is None or tokens_in is None:
            return None, "unpriced"
        return round(tokens_in * price / 1_000_000, 6), "estimated"

    def preview(self, items: list[tuple[str, dict[str, Any]]]) -> list[StagePreview]:
        """The first items, their text and metadata masked unless the run revealed them."""
        return [self._one(text, metadata) for text, metadata in items[: self.previews]]

    def _one(self, text: str, metadata: dict[str, Any]) -> StagePreview:
        values = {
            str(key): self._mask(self._path(_as_text(value)))[:_VALUE]
            for key, value in list(metadata.items())[:_KEYS]
        }
        return StagePreview(
            source=self._source(metadata),
            page=_page(metadata),
            characters=len(text),
            tokens=self.tokens([text]),
            # Masked over more than is kept, so a value cut at the edge is still covered.
            text=self._mask(text[: _TEXT * 2])[:_TEXT],
            metadata=values,
        )

    def _path(self, value: str) -> str:
        """An absolute path as `/…/` and its part under the run's folder, or its file name.

        That a value is an absolute path is the finding; the account name and folders it
        spells out are not kept in the report.
        """
        if not ABSOLUTE_PATH.match(value):
            return value
        path = Path(value)
        if self.root is not None:
            try:
                return f"/…/{path.relative_to(self.root)}"
            except ValueError:
                pass
        return f"/…/{path.name}"

    def masked(self, text: str) -> str:
        """`text` with identifiers masked, unless the run revealed them."""
        return self._mask(text)

    def _mask(self, text: str) -> str:
        return text if self.reveal else mask_text(text, config=self.settings).text

    def _source(self, metadata: dict[str, Any]) -> str | None:
        source = next((metadata[k] for k in SOURCE_KEYS if metadata.get(k)), None)
        if not isinstance(source, str | PurePath):
            return None
        path = Path(source)
        if self.root is not None and path.is_absolute():
            try:
                return str(path.relative_to(self.root))
            except ValueError:
                return str(path)
        return str(path)


def _page(metadata: dict[str, Any]) -> int | None:
    for key, offset in (("page_number", 0), ("page", 1)):
        value = metadata.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            return value + offset
    return None


def _as_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)
