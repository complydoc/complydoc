"""How much of the folder an independent vision read agreed with.

    report.verification.headline  # "3 of 80 pages disagree with an independent vision read"

A report that verified nothing has no summary, and says nothing about it:
`None` is a run without `--verify`, not a run that found everything agreed.
"""

from __future__ import annotations

from complydoc.report.models import DocumentReport, VerificationSummary
from complydoc.utils.text import count

__all__ = ["summarise_verification"]


def _basis(bases: set[str]) -> str:
    priced = bases - {"unpriced"}
    if not priced:
        return "unpriced"
    if len(priced) == 1:
        return priced.pop()
    return "mixed"


def _headline(checked: int, total: int, disagree: int, agree: int, filled: int, failed: int) -> str:
    """One sentence: how much was checked, and what came of it."""
    if not checked:
        return f"No page of the {count(total, 'page')} was sent for a vision read"
    compared = agree + disagree
    outcomes: list[str] = []
    if disagree:
        outcomes.append(f"{disagree} {'disagrees' if disagree == 1 else 'disagree'}")
    elif compared:
        outcomes.append("all agree" if compared > 1 else "it agrees")
    if filled:
        outcomes.append(f"{filled} only the vision model could read")
    if failed:
        outcomes.append(f"{failed} it could not read")
    return (
        f"{checked} of {count(total, 'page')} checked against an independent vision read: "
        + ", ".join(outcomes)
    )


def summarise_verification(
    documents: list[DocumentReport], min_coverage: float
) -> VerificationSummary | None:
    """The folder's verification totals, or None when no document was verified."""
    verified = [d.verification for d in documents if d.verification is not None]
    if not verified:
        return None

    pages = [page for v in verified for page in v.pages]
    costs = [page.cost for page in pages if page.cost is not None]
    priced = [cost.usd for cost in costs if cost.usd is not None]
    total = sum(v.pages_total for v in verified)
    # The status every page could not be sent under counts against nothing: it
    # was not checked, and the headline says how many were.
    sent = [page for page in pages if page.status != "not_rendered"]
    tally = {status: sum(1 for p in pages if p.status == status) for status in _STATUSES}

    return VerificationSummary(
        model=verified[0].model,
        scope=verified[0].scope,
        min_coverage=min_coverage,
        documents=len(verified),
        pages_total=total,
        pages_checked=len(sent),
        pages_agree=tally["agrees"],
        pages_disagree=tally["disagrees"],
        pages_filled=tally["filled"],
        pages_failed=tally["failed"],
        pages_unreadable=sum(len(v.unreadable_pages) for v in verified),
        usd=round(sum(priced), 6) if priced else None,
        usd_basis=_basis({cost.basis for cost in costs}),
        headline=_headline(
            len(sent), total, tally["disagrees"], tally["agrees"], tally["filled"], tally["failed"]
        ),
    )


_STATUSES = ("agrees", "disagrees", "filled", "failed", "not_rendered")
