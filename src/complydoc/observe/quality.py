"""What was wrong with what a stage passed on, though nothing raised.

The failures an ingestion pipeline meets most are quiet ones: a scanned PDF that
loads as no text, a page of replacement characters, chunks of a few tokens, a
text longer than the embedding model reads. Each is a warning on the stage whose
output shows it, naming the documents it concerns.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Final

from complydoc.extraction.chunks import ChunkReport
from complydoc.readiness.signals.garbled import garbled_rate
from complydoc.report.models import StageWarning
from complydoc.utils.text import count

__all__ = ["warnings_for"]

GARBLED: Final = 5.0
"""Garbled characters per 1,000 from which text is poor, as the readiness score has it."""

EMBEDDING_LIMITS: Final = {
    "text-embedding-3-small": 8191,
    "text-embedding-3-large": 8191,
    "text-embedding-ada-002": 8191,
}
"""Tokens an embedding model reads of one text; the rest is cut or refused."""

TINY_TOKENS: Final = 20
"""Below this many tokens a chunk carries too little to be found, as `inspect_chunks` flags it."""

Item = tuple[str, str | None]
"""An item's text, and the document it came from where that is known."""


def warnings_for(
    kind: str,
    items: list[Item],
    *,
    chunks: ChunkReport | None = None,
    model: str | None = None,
    tokens: Callable[[str], int] | None = None,
) -> list[StageWarning]:
    """The warnings on a stage of `kind` that passed on `items`, or for an embedding or
    store stage was given them."""
    if kind == "load":
        return _loaded(items)
    if kind == "split" and chunks is not None:
        return _split(chunks)
    if kind in ("embed", "store"):
        return _sent(kind, items, model, tokens)
    return []


def _by_source(items: list[Item]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for text, source in items:
        grouped.setdefault(source or "", []).append(text)
    return grouped


def _loaded(items: list[Item]) -> list[StageWarning]:
    warnings = []
    grouped = _by_source(items)
    empty = [s for s, texts in grouped.items() if not any(t.strip() for t in texts)]
    if empty:
        warnings.append(
            StageWarning(
                "empty_document",
                f"{count(len(empty), 'document')} loaded no text",
                [s for s in empty if s],
            )
        )
    partly = {
        s: sum(1 for t in texts if not t.strip())
        for s, texts in grouped.items()
        if s not in empty and len(texts) > 1
    }
    partly = {s: n for s, n in partly.items() if n}
    if partly:
        warnings.append(
            StageWarning(
                "empty_pages",
                f"{count(sum(partly.values()), 'page')} with no text, "
                f"in {count(len(partly), 'document')}",
                [s for s in partly if s],
            )
        )
    garbled = [
        s
        for s, texts in grouped.items()
        if (rate := garbled_rate("\n".join(texts))) is not None and rate >= GARBLED
    ]
    if garbled:
        warnings.append(
            StageWarning(
                "garbled",
                f"{count(len(garbled), 'document')} with garbled text: replacement "
                f"characters or words run together",
                [s for s in garbled if s],
            )
        )
    return warnings


def _split(report: ChunkReport) -> list[StageWarning]:
    warnings = []
    wording = {
        "tiny": f"under {TINY_TOKENS} tokens",
        "oversized": "over the maximum set",
        "duplicate": "repeating an earlier chunk",
    }
    for flag, words in wording.items():
        flagged = [c for c in report.chunks if flag in c.flags]
        if flagged:
            sources = list(dict.fromkeys(c.document for c in flagged if c.document))
            warnings.append(
                StageWarning(f"{flag}_chunks", f"{count(len(flagged), 'chunk')} {words}", sources)
            )
    return warnings


def _sent(
    kind: str, items: list[Item], model: str | None, tokens: Callable[[str], int] | None
) -> list[StageWarning]:
    warnings = []
    blank = [source for text, source in items if not text.strip()]
    if blank:
        verb = "embedded" if kind == "embed" else "stored"
        warnings.append(
            StageWarning(
                "empty_texts",
                f"{count(len(blank), 'empty text')} {verb}",
                list(dict.fromkeys(s for s in blank if s)),
            )
        )
    limit = EMBEDDING_LIMITS.get(model or "")
    if kind == "embed" and limit is not None and tokens is not None:
        over = [source for text, source in items if tokens(text) > limit]
        if over:
            warnings.append(
                StageWarning(
                    "over_token_limit",
                    f"{count(len(over), 'text')} over {model}'s limit of {limit:,} tokens",
                    list(dict.fromkeys(s for s in over if s)),
                )
            )
    return warnings
