"""Resolve a `--classifier` name into something that scores a passage.

The command line asks for a classifier by name. `jev` is the one complydoc
ships an adapter for; anything else is `module:function` pointing at code of
your own, which is how a locally held model is used without complydoc knowing
anything about it.

A classifier is the one thing in complydoc that can send document text off the
machine, so the name is not enough on its own: resolving one states what it
does, and the command that asked for it says so in its output and in the report.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import TYPE_CHECKING

from complydoc.config.schema import Config

if TYPE_CHECKING:  # pragma: no cover - type-checking imports only
    from collections.abc import Iterator

    from complydoc.hidden.instructions import Classifier

__all__ = [
    "SENDS_TEXT_OFF_THE_MACHINE",
    "ClassifierError",
    "classifying",
    "resolve_classifier",
]

_JEV_THRESHOLD = 0.5
"""Measured for Jev: it puts ordinary prose under 0.05 and the weakest real
injection at 0.60. See docs/explanation/accuracy.md."""

SENDS_TEXT_OFF_THE_MACHINE = frozenset({"jev"})
"""Named classifiers that reach a third party, rather than staying local.

Used to decide what a command has to say before it runs, not to decide whether
to allow it. A `module:function` classifier is caller code, and complydoc cannot
know where it sends anything, so it is not on this list and not vouched for.
"""


class ClassifierError(ValueError):
    """A `--classifier` value that could not be turned into a classifier."""


def resolve_classifier(spec: str) -> Classifier:
    """Build the classifier `spec` names.

    `jev` is TypeSafe's hosted judgement model, through the `typesafe` extra.
    Anything containing a colon is `module:function`, imported and called with
    no arguments; what it returns is the classifier.
    """
    name = spec.strip()
    if not name:
        raise ClassifierError("no classifier named")

    if name.lower() == "jev":
        try:
            from complydoc.integrations.typesafe import jev_classifier
        except ImportError as exc:  # pragma: no cover - depends on the extra
            raise ClassifierError(
                "jev needs the optional extra: uv tool install 'complydoc[typesafe]'"
            ) from exc
        try:
            # The flag is the caller saying the passages leave the machine, which
            # is what this argument means. It is not defaulted anywhere else.
            return jev_classifier(allow_network=True)
        except ValueError as exc:
            raise ClassifierError(str(exc)) from exc

    if ":" not in name:
        raise ClassifierError(
            f"unknown classifier {name!r}: use 'jev', or 'module:function' for your own"
        )

    module_name, _, attribute = name.partition(":")
    try:
        from importlib import import_module

        module = import_module(module_name)
    except ImportError as exc:
        raise ClassifierError(f"cannot import {module_name!r}: {exc}") from exc

    factory = getattr(module, attribute, None)
    if factory is None:
        raise ClassifierError(f"{module_name!r} has no {attribute!r}")
    if not callable(factory):
        raise ClassifierError(f"{name} is not callable")

    built = factory()
    if not callable(built):
        raise ClassifierError(f"{name}() returned {type(built).__name__}, not a callable")
    return built  # type: ignore[no-any-return]


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

    Two adjustments are made rather than left as traps. A classifier lives in
    one process, so an automatic job count becomes 1; a job count the caller
    asked for is left alone and said to be a problem instead. And a threshold
    tuned to one model is wrong for another, so `jev` uses the 0.5 measured for
    it where the caller named no threshold of their own.
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
        value = _JEV_THRESHOLD
        notes.append(
            f"Reporting passages scored at or above {value}, the value measured for Jev. "
            f"Pass --classifier-threshold to choose another."
        )
    if value is not None:
        config = config.override({"hidden.instructions.classifier_threshold": value})

    if jobs == 0:
        # Not a preference the caller expressed: the default asks the folder.
        jobs = 1
        notes.append(
            "Running in one process, because a classifier is registered in one process "
            "and documents read in a worker are read where it does not exist."
        )
    elif jobs > 1:
        notes.append(
            f"[yellow]--jobs {jobs} with a classifier:[/] documents read in worker "
            f"processes are not judged by it. The report counts them."
        )

    register_instruction_classifier(classifier)
    try:
        yield config, jobs, notes
    finally:
        # Registered for this run only, so a later one is not surprised by it.
        register_instruction_classifier(None)
