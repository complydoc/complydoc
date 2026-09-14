"""Scanning, masking, hidden-content checks and token counts on plain strings.

    import complydoc as cd

    cd.scan_text("Contact jane.doe@example.com").matches
    cd.mask_text("Card 4111 1111 1111 1111").text
    cd.find_hidden(retrieved_chunk)
    cd.count_tokens(prompt, model="claude-sonnet-5")

These use the same detectors, validators and patterns as a file audit, and run
inside the network guard. Without `config`, the shipped configuration is loaded
once and reused.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from functools import lru_cache

from complydoc import offline
from complydoc.config.loader import load_config
from complydoc.config.schema import Config
from complydoc.cost.tokenizer import TokenCount
from complydoc.cost.tokenizer import count_tokens as _count_tokens
from complydoc.extract import mask_matches, tokenizer_for
from complydoc.hidden.check import check_content
from complydoc.report.models import ContentFinding
from complydoc.sensitive.base import SensitiveMatch
from complydoc.sensitive.scanner import scan_text as _scan_text

__all__ = ["MaskedText", "TextScan", "count_tokens", "find_hidden", "mask_text", "scan_text"]


@dataclass(frozen=True, slots=True)
class TextScan:
    """Identifiers found in a string."""

    matches: list[SensitiveMatch]
    unscanned: dict[str, str] = field(default_factory=dict)
    """Categories that could not be scanned, with the reason."""

    @property
    def total(self) -> int:
        return len(self.matches)


@dataclass(frozen=True, slots=True)
class MaskedText:
    """A string with its identifiers replaced by mask characters."""

    text: str
    masked: int
    """Identifiers replaced."""
    masked_confirmed: int
    """Of those, how many passed a checksum."""
    unscanned: dict[str, str] = field(default_factory=dict)

    @property
    def complete(self) -> bool:
        """False when a category could not be scanned, so none of its values were masked."""
        return not self.unscanned


@lru_cache(maxsize=1)
def _shipped_config() -> Config:
    return load_config()


def _settings(config: Config | None) -> Config:
    return config if config is not None else _shipped_config()


def scan_text(text: str, *, config: Config | None = None, reveal: bool = False) -> TextScan:
    """Personal and financial identifiers in `text`, masked unless `reveal`."""
    settings = _settings(config)
    with offline.guarded():
        matches, unscanned = _scan_text(text, settings.sensitive, reveal)
    return TextScan(matches=matches, unscanned=unscanned)


def mask_text(text: str, *, config: Config | None = None) -> MaskedText:
    """`text` with each identifier replaced, strongest evidence first."""
    scan = scan_text(text, config=config)
    masked, replaced, confirmed = mask_matches(text, scan.matches)
    return MaskedText(
        text=masked, masked=replaced, masked_confirmed=confirmed, unscanned=scan.unscanned
    )


def find_hidden(
    text: str, *, config: Config | None = None, reveal: bool = False
) -> list[ContentFinding]:
    """Invisible characters and instruction-like passages in `text`.

    A string has no rendering to check, so visibility is `not_measured` except for
    characters that are invisible by definition, such as Unicode tag characters.
    """
    settings = _settings(config)
    with offline.guarded():
        check = check_content(None, [(1, text)], settings, reveal=reveal)
    return [dataclasses.replace(finding, page=None) for finding in check.findings]


def count_tokens(
    text: str, model: str | None = None, *, config: Config | None = None
) -> TokenCount:
    """Tokens in `text` for `model`, or for the headline model when none is given."""
    return _count_tokens(text, tokenizer_for(_settings(config), model))
