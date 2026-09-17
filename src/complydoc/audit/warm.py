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

That crash is no longer intermittent or unexplained. It reproduces on demand:
import torch in the process that starts the pool, and every worker forked from
it dies as `BrokenProcessPool` the moment it reads a document. Keeping the
entity model out of this file was right, but insufficient — a scan loads that
model in the parent anyway, through `ner_available`, which every audit calls to
fill a field in its report. The first audit in a process therefore forked
cleanly and every audit after it fell back to reading every document in the
parent, reporting `documents_read_after_worker_failure` and taking the time a
serial run takes.

`_pool_context` now chooses spawn once torch is present, so this preload is
used where it is safe and skipped where it is not. It was measured at about six
per cent of a parallel scan — 4.18s against 4.43s over ninety documents on six
workers — which was never worth a fork hazard.

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

    # The entity model is not warmed here. See the note at the top of the file:
    # it pulls in torch, and forking a process that has initialised torch is
    # unsafe. Each worker loads it on its first document instead.


warm()
