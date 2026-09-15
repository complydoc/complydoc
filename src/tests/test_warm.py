"""Loading the local models once, for the workers to inherit.

Importing `complydoc.audit.warm` is a side effect on purpose. Under the forkserver the
worker processes fork from a server that has imported it, so they start with the
models in memory instead of loading their own copies.

What may be warmed is limited by what survives a fork, which is the subject of
the last test here and of the note at the top of `complydoc/audit/warm.py`.
"""

from __future__ import annotations

from complydoc.audit.run import _pool_context


def test_warming_leaves_the_models_loaded():
    from complydoc.audit.warm import warm
    from complydoc.cost.tokenizer import _encoder

    _encoder.cache_clear()
    warm()
    assert _encoder.cache_info().currsize > 0, "the tokenizer vocabulary is in memory"


def test_warming_never_fails_a_run(monkeypatch):
    """A warm-up is an optimisation; nothing it cannot do is worth stopping for."""
    import complydoc.audit.warm as warm_module

    def explode(*args, **kwargs):
        raise RuntimeError("no model here")

    monkeypatch.setattr("complydoc.cost.tokenizer._encoder", explode)
    monkeypatch.setattr("complydoc.sensitive.detectors.ner._load", explode)
    warm_module.warm()


def test_nothing_that_cannot_be_forked_is_warmed():
    """The entity model must not be loaded in the process workers fork from.

    Loading it pulls in torch, which brings up Metal and Objective-C runtime
    state on macOS, and Apple's frameworks do not survive a fork. A worker
    forked from such a process was seen segfaulting inside pypdfium2 — code
    with no connection to either library, which is what an address space
    inherited in a bad state looks like.

    Preloading it saved about six per cent of a parallel scan. This test keeps
    it out.
    """
    import subprocess
    import sys

    # A fresh interpreter, because the test session has loaded plenty by now.
    probe = "import sys, complydoc.audit.warm as w; w.warm(); print('torch' in sys.modules)"
    result = subprocess.run(
        [sys.executable, "-c", probe], capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == "False", "warming must not pull in torch"


def test_the_pool_never_forks_this_process():
    """This process may hold the OCR engine's native threads by then.

    Forking one that does is a known way to hang the child, so the pool either
    forks from a clean server process or spawns.
    """
    assert _pool_context().get_start_method() in {"forkserver", "spawn"}
