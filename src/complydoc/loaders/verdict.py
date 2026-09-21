"""Which loader to use for this folder, and what decided it.

A comparison table says what each loader did. It does not say which one to
pick, and the table is where most people stop.

What can decide it, in the order the evidence is worth anything:

Files a loader could not open
    A loader that raised on a document read nothing from it, whatever else it
    did well. This is the only criterion that needs no interpretation.
Expected facts
    A passage the caller said the documents contain, found in one loader's text
    and missing from another's. This is the only signal that says which reading
    is *right* rather than merely different.
Speed
    Worth something only when the loaders returned the same text.

What deliberately decides nothing is a disagreement on its own. Two loaders
that read a two-column page in different orders produce different text, and
nothing in the text itself says which order the page was written in. Without a
fact to check, the honest answer is that this folder needs one, so the verdict
says so rather than picking the faster of two readings that may be wrong.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from complydoc.report.models import DocumentReport, LoaderComparison, LoaderSummary

__all__ = ["LoaderVerdict", "recommend"]


@dataclass(frozen=True, slots=True)
class LoaderVerdict:
    """The loader to use, or why the run cannot say."""

    recommended: str | None = None
    """None when nothing measured separates them."""
    reason: str = ""
    """What decided it, or what stopped it being decided."""
    ranked: list[str] = field(default_factory=list)
    """Every loader, best first, by whatever the run could measure."""


def _failures(loader: LoaderSummary) -> int:
    return len(loader.failures)


def _facts(loader: LoaderSummary) -> int:
    return loader.facts_found if loader.facts_found is not None else -1


def _order(loader: LoaderSummary) -> tuple[int, int, int, float]:
    """Best first: fewest failures, most documents, most facts, then quickest."""
    return (_failures(loader), -loader.documents, -_facts(loader), loader.seconds or 0.0)


def _disagreeing_documents(documents: list[DocumentReport]) -> list[str]:
    return sorted(d.relative_path for d in documents if d.extractors_disagree)


def recommend(comparison: LoaderComparison, documents: list[DocumentReport]) -> LoaderVerdict:
    """Which of the compared loaders to use, and the evidence for it."""
    loaders = [loader for loader in comparison.loaders if loader.error is None]
    if len(loaders) < 2:
        return LoaderVerdict(reason="only one loader ran, so there is nothing to compare")

    ranked = sorted(loaders, key=_order)
    best, runner_up = ranked[0], ranked[1]
    names = [loader.name for loader in ranked]

    if _failures(best) < _failures(runner_up):
        opened = best.documents
        return LoaderVerdict(
            recommended=best.name,
            reason=(
                f"{best.name} opened all {opened} documents; "
                f"{runner_up.name} raised on {_failures(runner_up)} of them"
            ),
            ranked=names,
        )

    if comparison.facts and _facts(best) > _facts(runner_up):
        total = len(comparison.facts)
        return LoaderVerdict(
            recommended=best.name,
            reason=(
                f"{best.name} kept {_facts(best)} of {total} expected "
                f"{'fact' if total == 1 else 'facts'}, {runner_up.name} kept {_facts(runner_up)}"
            ),
            ranked=names,
        )

    differing = _disagreeing_documents(documents)
    if differing:
        first = len(differing)
        advice = (
            "Pass a passage these documents contain, as a fact, and the comparison can say "
            "which reading holds it."
        )
        return LoaderVerdict(
            reason=(
                f"the loaders read {first} {'document' if first == 1 else 'documents'} "
                f"differently and nothing here says which reading is right. {advice}"
            ),
            ranked=names,
        )

    quickest = best.seconds
    if quickest is not None and runner_up.seconds is not None and quickest < runner_up.seconds:
        return LoaderVerdict(
            recommended=best.name,
            reason=(
                f"every loader read the same text, and {best.name} was the quickest at "
                f"{quickest:g}s against {runner_up.seconds:g}s"
            ),
            ranked=names,
        )

    return LoaderVerdict(
        reason="the loaders read the same text in about the same time, so take either",
        ranked=names,
    )
