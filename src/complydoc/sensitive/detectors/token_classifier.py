"""Person and organisation names, via a local token-classification model.

The shipped configuration uses spaCy, which is small and English. A
transformer model reads the European languages these documents are actually
written in, and measurably better: see Detection accuracy for the numbers.

    sensitive:
      categories:
        person_name:
          detector: token_classifier
          model:
            name: Babelscape/wikineural-multilingual-ner
            entity_labels: [PER]

`transformers` is an optional extra, and the weights are loaded from files
already on the machine. Nothing here downloads a model: a scan runs inside the
network guard, so a model that is not already on disk is reported as a category
that could not be scanned, with how to fetch it.

A token-classification model reads a few hundred tokens at a time. A page is
longer than that, so it is cut into windows at line boundaries and each window
is read on its own, with the offsets moved back onto the page.

Person and organisation names are two categories read by the same model, so a
page is read once and both take what they need from it. The scan reads a whole
document's windows ahead, in batches, and a worker process asks the audit's own
process to read them rather than loading a copy of the model: see
`model_server`.
"""

from __future__ import annotations

import os
import threading
from collections import OrderedDict
from collections.abc import Sequence
from functools import lru_cache
from multiprocessing import parent_process
from typing import Any

from complydoc.config.schema import SensitiveConfig
from complydoc.sensitive.base import DetectorContext, Finding
from complydoc.sensitive.detectors.model_server import Classify, Entity
from complydoc.sensitive.registry import DetectorUnavailableError, detector, models_for_detector
from complydoc.utils.install import extra_hint, hf_model_hint

__all__ = [
    "TokenClassifierDetector",
    "classify_windows",
    "configured_models",
    "model_available",
    "use_server",
]

_MIN_ALPHA = 2
"""Entities with fewer letters than this are discarded."""

_ACRONYM_MAX = 5
"""Single all-caps tokens up to this length are treated as field labels."""

_WINDOW_CHARS = 1200
"""Characters read at a time. Comfortably inside the usual 512-token ceiling."""

_BATCH = 8
"""Windows the model reads at once. Measured on a GPU: 22ms a window against 30ms one by one."""

_REMEMBERED_PAGES = 512
"""Pages whose entities are kept, so a document's pages read ahead are still there when scanned."""

_entities_by_page: OrderedDict[tuple[str, str], list[Entity]] = OrderedDict()

_server: Classify | None = None
"""The audit process's model, for a worker. None reads with a model loaded here."""


def use_server(classify: Classify | None) -> None:
    """Read with the audit process's model instead of loading one, or stop doing so."""
    global _server
    _server = classify


def _device() -> str | None:
    """Where the model runs: the best device in the audit's own process, the CPU in a worker.

    A worker is forked without being started afresh, and Metal cannot compile a
    shader in such a process: the first new kernel aborts it. A worker only
    loads the model when the audit's process cannot serve it.
    """
    return "cpu" if parent_process() is not None else None


def _install_hint(model_name: str) -> str:
    return f"{hf_model_hint(model_name)}, after you {extra_hint('multilingual-names')}"


_loading = threading.Lock()
"""Held while a model loads, so a scan and a warm-up on another thread load it once."""


def _load(model_name: str) -> Any:
    with _loading:
        return _load_once(model_name)


@lru_cache(maxsize=2)
def _load_once(model_name: str) -> Any:
    # The offline switches are read once, as the library is imported, so these
    # only help when complydoc is the first thing to import it. Anything that
    # imported `transformers` earlier, which LangChain does, leaves the library
    # online: the tokenizer then asks the hub for its templates, the scan's
    # network guard stops that, and the load failed with a message saying the
    # model was missing when it was in the cache all along.
    #
    # So each part is also told to use local files, which it honours whatever was
    # imported before it.
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"

    try:
        from transformers import AutoModelForTokenClassification, AutoTokenizer, pipeline
    except ImportError as exc:
        raise DetectorUnavailableError(
            f"the token classifier needs the optional extra ({extra_hint('multilingual-names')})"
        ) from exc

    from complydoc.offline import NetworkAccessError

    try:
        tokenizer = AutoTokenizer.from_pretrained(model_name, local_files_only=True)
        model = AutoModelForTokenClassification.from_pretrained(model_name, local_files_only=True)
        return pipeline(
            "token-classification",
            model=model,
            tokenizer=tokenizer,
            aggregation_strategy="simple",
            device=_device(),
        )
    except (OSError, ValueError, NetworkAccessError) as exc:
        # What a model that is not on this machine looks like. The guard is
        # armed for the whole of a scan, so weights that are absent locally end
        # as a blocked connection rather than a missing file, and both mean the
        # same thing to whoever has to fix it.
        #
        # Anything else is a fault worth seeing in full, so it is not dressed up
        # as a missing model: saying "not installed" about a library mismatch
        # sends the reader to fetch a model they already have.
        raise DetectorUnavailableError(f"{_install_hint(model_name)} ({exc})") from exc
    except Exception as exc:
        raise DetectorUnavailableError(
            f"the token classifier could not load {model_name!r}: {type(exc).__name__}: {exc}"
        ) from exc


def model_available(model_name: str) -> tuple[bool, str | None]:
    """Whether the model loads from files already on this machine."""
    try:
        _load(model_name)
    except DetectorUnavailableError as exc:
        return False, str(exc)
    return True, None


def classify_windows(model_name: str, windows: Sequence[str]) -> list[list[Entity]]:
    """Read windows with a model loaded in this process: the entities of each, in order."""
    if not windows:
        return []
    classify = _load(model_name)
    results = classify(list(windows), batch_size=_BATCH)
    return [
        [
            (str(e.get("entity_group", "")), int(e["start"]), int(e["end"]), float(e["score"]))
            for e in entities
        ]
        for entities in results
    ]


def _read(model_name: str, windows: Sequence[str]) -> list[list[Entity]]:
    if _server is not None:
        return _server(model_name, windows)
    return classify_windows(model_name, windows)


def _remember(key: tuple[str, str], entities: list[Entity]) -> None:
    _entities_by_page[key] = entities
    _entities_by_page.move_to_end(key)
    while len(_entities_by_page) > _REMEMBERED_PAGES:
        _entities_by_page.popitem(last=False)


def _read_pages(model_name: str, texts: Sequence[str]) -> None:
    """Read every window of these pages in one request, and remember each page's entities."""
    pages = [t for t in dict.fromkeys(texts) if (model_name, t) not in _entities_by_page]
    windows: list[tuple[int, int, str]] = []
    for index, text in enumerate(pages):
        windows.extend((index, offset, piece) for offset, piece in _windows(text) if piece.strip())
    read = _read(model_name, [piece for _index, _offset, piece in windows])
    found: list[list[Entity]] = [[] for _ in pages]
    for (index, offset, _piece), entities in zip(windows, read, strict=True):
        found[index].extend(
            (label, offset + start, offset + end, score) for label, start, end, score in entities
        )
    for text, entities in zip(pages, found, strict=True):
        _remember((model_name, text), entities)


def _page_entities(model_name: str, text: str) -> list[Entity]:
    key = (model_name, text)
    if key not in _entities_by_page:
        _read_pages(model_name, [text])
    return _entities_by_page[key]


def configured_models(config: SensitiveConfig) -> list[str]:
    """Every model named by an enabled category that uses this detector, in order."""
    return models_for_detector(config, TokenClassifierDetector.id)


def _windows(text: str) -> list[tuple[int, str]]:
    """The page in pieces small enough to read, as (offset, piece).

    Cut at line boundaries: an entity split across two windows would be lost,
    and one split across a line break is dropped anyway.
    """
    if len(text) <= _WINDOW_CHARS:
        return [(0, text)]
    pieces: list[tuple[int, str]] = []
    start = 0
    while start < len(text):
        end = min(start + _WINDOW_CHARS, len(text))
        if end < len(text):
            cut = text.rfind("\n", start, end)
            if cut > start:
                end = cut + 1
        pieces.append((start, text[start:end]))
        start = end
    return pieces


@detector
class TokenClassifierDetector:
    id = "token_classifier"

    def prepare(self, texts: Sequence[str], context: DetectorContext) -> None:
        """Read a document's pages ahead, in batches, so each page's `find` has its entities."""
        if context.config.model is not None:
            _read_pages(context.config.model.name, texts[:_REMEMBERED_PAGES])

    def find(self, text: str, context: DetectorContext) -> list[Finding]:
        spec = context.config.model
        if spec is None:
            raise DetectorUnavailableError(
                f"category {context.category_id!r} uses the token classifier but names no model"
            )
        wanted = {label.upper() for label in spec.entity_labels}

        findings: list[Finding] = []
        for label, start, end, score in _page_entities(spec.name, text):
            if label.upper() not in wanted:
                continue
            span = text[start:end]
            if spec.drop_multiline and ("\n" in span or "\r" in span):
                continue
            if sum(1 for character in span if character.isalpha()) < _MIN_ALPHA:
                continue
            if (
                spec.drop_short_acronyms
                and len(span) <= _ACRONYM_MAX
                and span.isupper()
                and " " not in span.strip()
            ):
                continue
            findings.append(Finding(start=start, end=end, confidence=score))
        return findings
