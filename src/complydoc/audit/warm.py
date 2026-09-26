"""Load what is cheap and safe to inherit, once, before the workers fork.

Importing this module is a side effect on purpose: it pays for the tokenizer
vocabulary and the language identifier up front. On its own that saves nothing,
but the process pool forks its workers from a server process that has imported
this, so each worker starts with them already in memory.

The name model is not preloaded, and does not run in the workers at all. On a
Mac it runs on the GPU, and Metal cannot reach its shader compiler from a
process forked without a fresh start, which is what every worker is: the first
page that needed a kernel not yet compiled aborted the worker, and the run read
every document again in the parent. The audit's own process holds the model
and answers the workers instead; see `complydoc.sensitive.detectors.model_server`.

Nothing here reaches the network — every model is local, and the offline guard
is armed before any of it runs.
"""

from __future__ import annotations

__all__ = ["warm"]


def warm() -> None:
    """Load what a worker would otherwise load on its first document."""
    try:
        import py3langid

        py3langid.classify("the quick brown fox jumps over the lazy dog")
    except Exception:  # pragma: no cover - a warm-up must never fail a run
        pass

    try:
        from complydoc.config.loader import load_config
        from complydoc.cost.tokenizer import _encoder

        for name in {m.tokenizer.encoding for m in load_config().pricing.usable_models}:
            _encoder(name)
    except Exception:  # pragma: no cover - a warm-up must never fail a run
        pass

    # The name model is not warmed here. See the note at the top of the file:
    # the workers ask the audit's own process to read names.


warm()
