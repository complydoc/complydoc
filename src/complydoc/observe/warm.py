"""Load, while the pipeline runs, what reading its output will need once it has.

When a block ends, complydoc counts tokens, tells each page's language and reads names in
what the pipeline produced. Each of those loads something first: a tokenizer's vocabulary,
a language identifier, a name model. None of that depends on the pipeline's output, so it
is loaded on a thread while the pipeline is running, and the block's end starts with it in
memory. On a small pipeline that loading was most of the time observing added.

Only what is on this machine, and what loading cannot disturb:

- a tokenizer whose vocabulary is already in complydoc's cache, never one that would be
  fetched: the block lets connections through and records them as the pipeline's own;
- the spaCy name model, when it is the one that will read names. The transformer model is
  left for the block's end: loading it switches Hugging Face's libraries to offline for
  the process, which would stop the pipeline's own code downloading a model.
"""

from __future__ import annotations

import contextlib
import importlib.util
import threading

from complydoc.config.schema import Config

__all__ = ["start"]

Scan = str


def start(settings: Config, scan: Scan) -> threading.Thread:
    """Begin loading on a thread, and return it for the block's end to wait on."""
    thread = threading.Thread(
        target=_warm, args=(settings, scan), name="complydoc-observe-warm", daemon=True
    )
    thread.start()
    return thread


def _warm(settings: Config, scan: Scan) -> None:
    # A warm-up must never fail a run: whatever it could not load is loaded, or reported
    # as missing, where it is used.
    with contextlib.suppress(Exception):
        from complydoc.cost.tokenizer import _encoder, available_encodings
        from complydoc.extraction.extract import tokenizer_for

        encoding = tokenizer_for(settings, None).encoding
        if encoding in available_encodings():
            _encoder(encoding)
    if scan == "off":
        return
    with contextlib.suppress(Exception):
        import py3langid

        py3langid.classify("the quick brown fox jumps over the lazy dog")
    with contextlib.suppress(Exception):
        from complydoc.sensitive.detectors import ner, token_classifier

        # The transformer answers first where it is installed, and is not loaded here.
        transformer = token_classifier.configured_models(settings.sensitive)
        if not transformer or importlib.util.find_spec("transformers") is None:
            for name in ner.configured_models(settings.sensitive):
                ner.model_available(name)
