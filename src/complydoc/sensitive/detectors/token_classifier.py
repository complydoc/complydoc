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

Most models tag a name's tokens B (begins) and I (inside), which the Hugging Face
pipeline groups. Veil's models tag them BIOES, adding E (ends) and S (a one-token
entity), which the pipeline does not understand: it took every E and S token for
an entity of its own, under a label such as "E-PERSON" that no category asks for,
so "Gomes" came back as "Gome" and the "s" was left on the page. A model whose
labels use E or S is decoded here instead (`_bioes_entities`).

Person and organisation names are two categories read by the same model, so a
page is read once and both take what they need from it. The scan reads a whole
document's windows ahead, in batches, and a worker process asks the audit's own
process to read them rather than loading a copy of the model: see
`model_server`.
"""

from __future__ import annotations

import math
import os
import threading
from collections import OrderedDict
from collections.abc import Sequence
from functools import lru_cache
from multiprocessing import parent_process
from typing import Any

from complydoc.config.schema import SensitiveConfig
from complydoc.sensitive.base import (
    DetectorContext,
    Finding,
    drop_entity,
)
from complydoc.sensitive.detectors.model_server import Classify, Entity
from complydoc.sensitive.registry import DetectorUnavailableError, detector, models_for_detector
from complydoc.utils.install import extra_hint, hf_model_hint

__all__ = [
    "TokenClassifierDetector",
    "classify_windows",
    "configured_models",
    "model_available",
    "page_entities",
    "use_server",
]

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
        tags = [str(model.config.id2label[i]) for i in range(len(model.config.id2label))]
        bioes = _is_bioes(tags)
        reader = pipeline(
            "token-classification",
            model=model,
            tokenizer=tokenizer,
            # The pipeline still places the model on its device; a BIOES model
            # is then read by _BioesReader, which needs every tag's probability.
            aggregation_strategy="none" if bioes else "simple",
            device=_device(),
        )
        return _BioesReader(reader, tags) if bioes else reader
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
            (
                str(e.get("entity_group", "")),
                *_trimmed(window, int(e["start"]), int(e["end"])),
                float(e["score"]),
            )
            for e in entities
        ]
        for window, entities in zip(windows, results, strict=True)
    ]


def _trimmed(text: str, start: int, end: int) -> tuple[int, int]:
    """The span without the whitespace at its edges, and with the whole of its first and last words.

    A SentencePiece tokenizer (mDeBERTa, XLM-R) gives a word's token the space
    or line break before it, so a name at the start of a line comes back as
    "\nMaria Santos" and `drop_multiline` threw it away.

    A model can also stop inside a word, on one of its tokens. The rest of the
    word is then left on the page beside the mask, so the span takes it in.
    """
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    if start < end:
        while start > 0 and text[start - 1].isalnum() and text[start].isalnum():
            start -= 1
        while end < len(text) and text[end].isalnum() and text[end - 1].isalnum():
            end += 1
    return start, end


# ---------------------------------------------------------------- BIOES

_PREFIXES = {"B": "B", "I": "I", "E": "E", "S": "S", "L": "E", "U": "S"}
"""Each tag prefix as BIOES has it. BILOU's L (last) and U (unit) are E and S by another name."""


def _parse(tag: str) -> tuple[str, str]:
    """("B", "PERSON") for "B-PERSON"; ("O", "") for "O" or a tag in no scheme."""
    prefix, _, label = tag.partition("-")
    if label and prefix.upper() in _PREFIXES:
        return _PREFIXES[prefix.upper()], label
    return "O", ""


def _is_bioes(tags: Sequence[str]) -> bool:
    """Whether a model's tags mark an entity's last token or a one-token entity."""
    return any(_parse(tag)[0] in "ES" for tag in tags if _parse(tag)[1])


def _viterbi(logprobs: Sequence[Sequence[float]], tags: Sequence[str]) -> list[int]:
    """The likeliest sequence of tags that is legal in BIOES.

    Read token by token, a model can say B, then O, then E: a name with a hole
    in it. The legal path is the one Veil's own decoder takes (veil.models.predict).
    I and E follow only B or I of the same label; O, B and S follow only O, E or
    S. That makes each step one maximum over the closed tags plus one per label,
    so plain Python keeps up without a tensor library.
    """
    if not logprobs:
        return []
    parsed = [_parse(tag) for tag in tags]
    closed = [k for k, (p, _) in enumerate(parsed) if p in "OES"]
    opening = [k for k, (p, _) in enumerate(parsed) if p in "OBS"]
    inside = {
        k: [j for j, (q, other) in enumerate(parsed) if q in "BI" and other == label]
        for k, (p, label) in enumerate(parsed)
        if p in "IE"
    }
    impossible = float("-inf")
    starts = set(opening)
    score = [lp if k in starts else impossible for k, lp in enumerate(logprobs[0])]
    back: list[list[int]] = []
    for row in logprobs[1:]:
        best = max(closed, key=score.__getitem__)
        step = [best] * len(tags)
        new = [impossible] * len(tags)
        for k in opening:
            new[k] = score[best] + row[k]
        for k, before in inside.items():
            if before:
                came = max(before, key=score.__getitem__)
                step[k] = came
                new[k] = score[came] + row[k]
        back.append(step)
        score = new
    last = max(closed, key=score.__getitem__)
    path = [last]
    for step in reversed(back):
        path.append(step[path[-1]])
    return path[::-1]


def _bioes_entities(
    text: str,
    logprobs: Sequence[Sequence[float]],
    offsets: Sequence[tuple[int, int]],
    tags: Sequence[str],
) -> list[dict[str, Any]]:
    """A window's entities from its tokens' log-probabilities, in the pipeline's shape.

    `logprobs` and `offsets` cover the window's real tokens, without the special
    ones. An entity's score is the mean, over its tokens, of the probability
    that the token belongs to that label in any position (B, I, E or S), the
    score Veil's own decoder gives and the Judge is calibrated on.

    Two entities of the same label with nothing or one space between them are
    one: "Rua de Cedofeita, 360" and the "," after it, or "6 de março" and "de".
    A piece with no letter or digit in it, such as that comma on its own, hides
    nothing and is dropped.
    """
    parsed = [_parse(tag) for tag in tags]
    by_label: dict[str, list[int]] = {}
    for k, (_prefix, label) in enumerate(parsed):
        if label:
            by_label.setdefault(label, []).append(k)

    spans: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for row, (start, end), k in zip(logprobs, offsets, _viterbi(logprobs, tags), strict=True):
        prefix, label = parsed[k]
        if prefix == "O":
            current = None
            continue
        if current is None or prefix in "BS":
            current = {"entity_group": label, "start": start, "end": end, "probs": []}
            spans.append(current)
        current["end"] = end
        current["probs"].append(sum(math.exp(row[j]) for j in by_label[label]))
        if prefix in "ES":
            current = None

    merged: list[dict[str, Any]] = []
    for span in spans:
        before = merged[-1] if merged else None
        if (
            before is not None
            and before["entity_group"] == span["entity_group"]
            and text[before["end"] : span["start"]].strip(" ") == ""
            and span["start"] - before["end"] <= 1
        ):
            before["end"] = span["end"]
            before["probs"].extend(span["probs"])
            continue
        merged.append(span)

    return [
        {
            "entity_group": span["entity_group"],
            "start": span["start"],
            "end": span["end"],
            "score": sum(span["probs"]) / len(span["probs"]),
        }
        for span in merged
        if any(ch.isalnum() for ch in text[span["start"] : span["end"]])
    ]


class _BioesReader:
    """Reads windows with a BIOES model, called as the pipeline is called."""

    def __init__(self, pipe: Any, tags: Sequence[str]) -> None:
        self.model = pipe.model
        self.tokenizer = pipe.tokenizer
        self.device = pipe.device
        self.tags = list(tags)
        limit = getattr(self.tokenizer, "model_max_length", 512)
        self.max_length = limit if isinstance(limit, int) and limit <= 8192 else 512

    def __call__(
        self, windows: Sequence[str], batch_size: int = _BATCH
    ) -> list[list[dict[str, Any]]]:
        import torch

        found: list[list[dict[str, Any]]] = []
        for first in range(0, len(windows), batch_size):
            batch = list(windows[first : first + batch_size])
            encoded = self.tokenizer(
                batch,
                return_offsets_mapping=True,
                truncation=True,
                max_length=self.max_length,
                padding=True,
                return_tensors="pt",
            )
            offsets = encoded.pop("offset_mapping").tolist()
            attention = encoded["attention_mask"].tolist()
            with torch.no_grad():
                logits = self.model(**{k: v.to(self.device) for k, v in encoded.items()}).logits
            logprobs = torch.log_softmax(logits.float(), dim=-1).cpu().tolist()
            for text, rows, spans, mask in zip(batch, logprobs, offsets, attention, strict=True):
                real = [i for i, (s, e) in enumerate(spans) if mask[i] and s < e]
                found.append(
                    _bioes_entities(
                        text,
                        [rows[i] for i in real],
                        [(int(spans[i][0]), int(spans[i][1])) for i in real],
                        self.tags,
                    )
                )
        return found


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


def page_entities(model_name: str, text: str) -> list[Entity]:
    """Every entity the model found on the page, of any label, as (label, start, end, score).

    The page is read once whichever category asks: a reviewer that wants the labels no
    category reads (complydoc.sensitive.review) gets the same reading, not a second one.
    """
    return list(_page_entities(model_name, text))


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
            if drop_entity(text[start:end], spec):
                continue
            findings.append(Finding(start=start, end=end, confidence=score))
        return findings
