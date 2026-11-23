"""Asking a person to see one masked value.

A model reading a masked document sometimes needs one of the values it cannot see: the
IBAN a payment goes to, the name on a contract. Each masked value carries a number, as
`[#153 IBAN ••••••••••••••••••4521]`, and the model asks for it by that number and says
why. The person is shown the number, what kind of value it is, the sentence around it,
still masked, and the reason, and allows or declines it. Only that one value is given.

Two things never change:

- The person decides. The model asking is not the person allowing.
- A category under `masking.never_reveal`, such as a card number, is never given, allowed
  or not.

Every request is added to a log on this computer, allowed or not: when, which document,
which number, the reason and the answer. The value itself is never written to it.
"""

from __future__ import annotations

import json
import os
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from complydoc.config.schema import MaskingConfig
    from complydoc.extraction.extract import Placed

__all__ = [
    "REVEAL_LOG",
    "MaskedSpan",
    "RevealLog",
    "RevealRequest",
    "UnmaskError",
]

REVEAL_LOG = Path.home() / ".complydoc" / "reveals.jsonl"
"""Where each request to see a masked value is recorded, without the value."""

CONTEXT = 90
"""Characters of text shown on each side of a value, for the person deciding."""

Decision = Literal["allowed", "declined", "refused", "unavailable"]
"""What became of a request: the person allowed or declined it; complydoc refused it (a
category never revealed); or nobody could be asked."""


@dataclass(frozen=True, slots=True)
class MaskedSpan:
    """One masked value, as a model and a person may see it: never the value itself."""

    id: int
    """The number it carries in the text, `#id`. The same each time the text is read."""
    label: str
    """What kind of value it is, such as "IBAN"."""
    page: int | None
    """The page it is on, for a document."""
    context: str
    """The text around it, masked, with it shown as its marker."""
    revealable: bool
    """False for a category that is never revealed."""

    @property
    def marker(self) -> str:
        return f"#{self.id}"


@dataclass(frozen=True, slots=True)
class RevealRequest:
    """What a person is asked about, before one masked value is given."""

    span: MaskedSpan
    reason: str
    """Why the asker says it needs the value."""
    source: str | None = None
    """The document it is in, when it is in one."""

    def question(self) -> str:
        """The request in plain words, for a prompt shown to the person.

        The question and the reason come first: a client may show only the first lines.
        """
        where = f" in {Path(self.source).name}" if self.source else ""
        page = f", page {self.span.page}" if self.span.page else ""
        reason = self.reason.strip() or "(no reason given)"
        return (
            f"Allow the assistant to see {self.span.marker} ({self.span.label}{page}){where}? "
            "Only this value is revealed.\n"
            f"Reason given: {reason}\n"
            f"“{self.span.context}”"
        )


class UnmaskError(Exception):
    """A request that cannot be put to the person: no such number, or a value never revealed."""


@dataclass(slots=True)
class _Value:
    """A masked value, kept in memory only, beside what may be shown of it."""

    span: MaskedSpan
    stretch: Stretch


class Values:
    """The masked values of one text, by number. Kept in memory, never written."""

    def __init__(self, values: Sequence[_Value] = ()) -> None:
        self._by_id = {value.span.id: value for value in values}

    @property
    def spans(self) -> tuple[MaskedSpan, ...]:
        return tuple(value.span for value in self._by_id.values())

    def span(self, number: int) -> MaskedSpan:
        found = self._by_id.get(number)
        if found is None:
            highest = max(self._by_id, default=0)
            if not highest:
                raise UnmaskError("Nothing in this text is masked.")
            raise UnmaskError(
                f"There is no masked value #{number}; they run from #1 to #{highest}."
            )
        return found.span

    def value(self, number: int) -> str:
        """The value itself, its line breaks made spaces. Only for a request allowed."""
        return " ".join(self._by_id[number].stretch.value.split())

    def marked(self, page: int | None, text: str) -> str:
        """A page's masked text with each value shown as `[#n LABEL •••]`."""
        here = sorted(
            (v for v in self._by_id.values() if v.stretch.page == page),
            key=lambda v: v.stretch.start,
        )
        out: list[str] = []
        position = 0
        for value in here:
            stretch = value.stretch
            out.append(text[position : stretch.start])
            out.append(_marker(value.span.id, value.span.label, text[stretch.start : stretch.end]))
            position = stretch.end
        out.append(text[position:])
        return "".join(out)

    def __len__(self) -> int:
        return len(self._by_id)


@dataclass(frozen=True, slots=True)
class Stretch:
    """A masked stretch of one page's text: where it is now, and what was found there."""

    page: int | None
    start: int
    end: int
    value: str
    labels: tuple[str, ...]
    categories: tuple[str, ...]


def stretches(page: int | None, original: str, placed: Sequence[Placed]) -> list[Stretch]:
    """The stretches masking covered on a page, with the original characters under each."""
    return [
        Stretch(
            page=page,
            start=p.start,
            end=p.end,
            value=original[p.start : p.end],
            labels=tuple(dict.fromkeys(m.label for m in p.matches)),
            categories=tuple(dict.fromkeys(m.category for m in p.matches)),
        )
        for p in placed
    ]


def moved(found: Sequence[Stretch], edits: Sequence[tuple[int, int, int]]) -> list[Stretch]:
    """The stretches after passages were taken out of the text.

    `edits` are (start, end, length of what stands in its place) in the text as it was. A
    stretch inside a passage taken out is gone with it; one after it moves by the difference.
    """
    if not edits:
        return list(found)
    kept: list[Stretch] = []
    for stretch in found:
        if any(start < stretch.end and stretch.start < end for start, end, _ in edits):
            continue
        shift = sum(put - (end - start) for start, end, put in edits if end <= stretch.start)
        kept.append(_shifted(stretch, shift))
    return kept


def _shifted(stretch: Stretch, by: int) -> Stretch:
    return Stretch(
        stretch.page,
        stretch.start + by,
        stretch.end + by,
        stretch.value,
        stretch.labels,
        stretch.categories,
    )


def number(
    pages: Sequence[tuple[int | None, str]],
    found: Sequence[Stretch],
    config: MaskingConfig,
) -> Values:
    """Number the masked values 1, 2, 3… in reading order, with the text around each."""
    from complydoc.sensitive.masking import reveal_allowed

    texts = dict(pages)
    order = {page: index for index, (page, _) in enumerate(pages)}
    ordered = sorted(found, key=lambda s: (order.get(s.page, len(order)), s.start))
    values: list[_Value] = []
    for index, stretch in enumerate(ordered, start=1):
        text = texts.get(stretch.page, "")
        span = MaskedSpan(
            id=index,
            label=stretch.labels[0],
            page=stretch.page,
            context=_context(text, stretch, index),
            revealable=all(reveal_allowed(c, config) for c in stretch.categories),
        )
        values.append(_Value(span, stretch))
    return Values(values)


def _marker(index: int, label: str, masked: str) -> str:
    return f"[#{index} {label} {masked}]"


def _context(text: str, stretch: Stretch, index: int) -> str:
    """The text around a stretch, whitespace collapsed, cut at a word on each side."""
    before = text[max(0, stretch.start - CONTEXT) : stretch.start]
    after = text[stretch.end : stretch.end + CONTEXT]
    if stretch.start > CONTEXT and " " in before:
        before = "…" + before[before.index(" ") + 1 :]
    if stretch.end + CONTEXT < len(text) and " " in after:
        after = after[: after.rindex(" ")] + "…"
    shown = _marker(index, stretch.labels[0], text[stretch.start : stretch.end])
    return " ".join(f"{before}{shown}{after}".split())


Approve = Callable[[RevealRequest], bool]
"""Asks the person, and says whether they allowed it."""


class RevealLog:
    """The record of every request to see a masked value, one JSON object a line.

    It holds when, where, which number, what kind of value, the reason and the answer.
    It never holds the value.
    """

    def __init__(self, path: str | os.PathLike[str] | None = REVEAL_LOG) -> None:
        self.path = Path(path).expanduser() if path is not None else None

    def record(
        self, request: RevealRequest, decision: Decision, *, asker: str = "assistant"
    ) -> None:
        if self.path is None:
            return
        entry = {
            "time": datetime.now(UTC).isoformat(timespec="seconds"),
            "document": request.source,
            "id": request.span.id,
            "label": request.span.label,
            "page": request.span.page,
            "reason": request.reason,
            "decision": decision,
            "asker": asker,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as log:
            log.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def entries(self) -> list[dict[str, object]]:
        if self.path is None or not self.path.exists():
            return []
        lines = self.path.read_text(encoding="utf-8").splitlines()
        return [json.loads(line) for line in lines if line.strip()]
