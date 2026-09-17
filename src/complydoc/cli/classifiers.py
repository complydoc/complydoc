"""Turn a `--classifier` name into a registration that lasts one command.

Resolving a name lives in `complydoc.hidden.instructions`, because a worker
process has to do it too and nothing under `complydoc.cli` is loaded there.
What stays here is the part that belongs to a command: what it says before it
runs, and what it puts back when it finishes.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import TYPE_CHECKING

from complydoc.config.schema import Config
from complydoc.hidden.instructions import (
    JEV_THRESHOLD,
    SENDS_TEXT_OFF_THE_MACHINE,
    ClassifierError,
    resolve_classifier,
)

if TYPE_CHECKING:  # pragma: no cover - type-checking imports only
    from collections.abc import Iterator

__all__ = [
    "JEV_THRESHOLD",
    "SENDS_TEXT_OFF_THE_MACHINE",
    "ClassifierError",
    "classifying",
    "resolve_classifier",
]


@contextmanager
def classifying(
    spec: str | None,
    threshold: float | None,
    *,
    jobs: int,
    config: Config,
) -> Iterator[tuple[Config, int, list[str]]]:
    """Register the classifier `spec` names for the duration of the block.

    Yields the config and job count to run with, and the lines the command
    should print before it starts. Nothing is registered when `spec` is None,
    which is every ordinary run.

    The job count is left alone: the name is handed to every worker, which
    resolves its own classifier, so a parallel run judges every document. A
    threshold tuned to one model is wrong for another, so `jev` uses the 0.5
    measured for it where the caller named no threshold of their own.
    """
    from complydoc.hidden.instructions import register_instruction_classifier

    if spec is None:
        yield config, jobs, []
        return

    classifier = resolve_classifier(spec)
    notes: list[str] = []

    if spec.strip().lower() in SENDS_TEXT_OFF_THE_MACHINE:
        notes.append(
            "[bold yellow]--classifier jev sends the passages it judges to "
            "api.typesafe.ai.[/] Nothing else in this run leaves the machine, and the "
            "report names where the text went."
        )
    else:
        notes.append(
            f"[yellow]--classifier {spec} is your own code.[/] complydoc does not know "
            f"whether it sends anything anywhere; the guard records it if it does."
        )

    value = threshold
    if value is None and spec.strip().lower() == "jev":
        value = JEV_THRESHOLD
        notes.append(
            f"Reporting passages scored at or above {value}, the value measured for Jev. "
            f"Pass --classifier-threshold to choose another."
        )
    if value is not None:
        config = config.override({"hidden.instructions.classifier_threshold": value})

    register_instruction_classifier(classifier)
    try:
        yield config, jobs, notes
    finally:
        # Registered for this run only, so a later one is not surprised by it.
        register_instruction_classifier(None)
