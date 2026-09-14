"""Load what is cheap and safe to inherit, once, before the workers fork.

Importing this module is a side effect on purpose: it pays for the tokenizer
vocabulary and the language identifier up front. On its own that saves nothing,
but the process pool forks its workers from a server process that has imported
this, so each worker starts with them already in memory.

The entity model is not preloaded. Loading it pulls in torch, and a process that
has initialised torch is not safe to fork from: on macOS it brings up Metal and Objective-C runtime
state, and Apple's frameworks are explicit that they do not survive a fork.
A worker forked from such a process was observed segfaulting inside pypdfium2,
in code that has nothing to do with either library — the signature of an
address space the child inherited in a bad state.

That crash is intermittent and was not reproducible often enough to prove this
removes it. What can be said is that the hazard is real and documented, that
the same file's `_pool_context` already refuses to fork this process for the
same reason, and that preloading the model was measured at about six per cent
of a parallel scan — 4.18s against 4.43s over ninety documents on six workers.
Six per cent is not worth a fork hazard, whatever the crash turns out to be.

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
    except Exception:  # pragma: no cover
        pass

    # The entity model is not warmed here. See the note at the top of the file:
    # it pulls in torch, and forking a process that has initialised torch is
    # unsafe. Each worker loads it on its first document instead.


warm()
