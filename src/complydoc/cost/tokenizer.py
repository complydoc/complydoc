"""Text token counting against a vendored tokenizer, with a character-based fallback.

The encodings are vendored (see `complydoc.vendor`), so this works offline on a
machine that has never had network access. If an encoding named in pricing.yaml
is not among the vendored ones, complydoc does not go and fetch it — it falls
back to a character-based estimate and says so in the report.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from complydoc.config.schema import TokenizerSpec
from complydoc.vendor import TIKTOKEN_CACHE_DIR

__all__ = ["TokenCount", "available_encodings", "count_tokens", "tokenizer_key"]

# Must be set before tiktoken is imported anywhere in the process.
os.environ.setdefault("TIKTOKEN_CACHE_DIR", str(TIKTOKEN_CACHE_DIR))

_FALLBACK_CHARS_PER_TOKEN = 4.0


@dataclass(frozen=True, slots=True)
class TokenCount:
    tokens: int
    encoding: str
    fidelity: str
    """'exact', 'approximate' (real tokenizer, wrong provider) or 'estimated'."""
    note: str | None = None

    @property
    def is_measured(self) -> bool:
        return self.fidelity != "estimated"


@lru_cache(maxsize=8)
def _encoder(name: str) -> Any | None:
    try:
        import tiktoken
    except ImportError:
        return None
    try:
        return tiktoken.get_encoding(name)
    except Exception:
        # Anything at all here — an unknown name, or a fetch attempt the offline
        # guard refused — means we do not have this encoding locally.
        return None


def available_encodings() -> list[str]:
    return sorted({p.name for p in TIKTOKEN_CACHE_DIR.glob("*") if p.is_file()})


def tokenizer_key(spec: TokenizerSpec) -> str:
    """A name for the count `spec` produces: two models that count alike share it.

    Used to key token counts carried in a report, so a page is counted once per
    way of counting rather than once per model.
    """
    if spec.fidelity == "exact":
        return spec.encoding
    return f"{spec.encoding}x{spec.approximate_ratio:g}"


def count_tokens(text: str, spec: TokenizerSpec) -> TokenCount:
    if not text:
        return TokenCount(tokens=0, encoding=spec.encoding, fidelity=spec.fidelity)

    encoder = _encoder(spec.encoding)
    if encoder is None:
        estimate = round(len(text) / _FALLBACK_CHARS_PER_TOKEN)
        return TokenCount(
            tokens=estimate,
            encoding=f"{spec.encoding} (unavailable)",
            fidelity="estimated",
            note=(
                f"The {spec.encoding} encoding is not available locally and complydoc will "
                f"not download it at runtime, so this count is a crude estimate of one "
                f"token per {_FALLBACK_CHARS_PER_TOKEN:.0f} characters."
            ),
        )

    raw = len(encoder.encode(text, disallowed_special=()))
    if spec.fidelity == "exact":
        return TokenCount(tokens=raw, encoding=spec.encoding, fidelity="exact")

    adjusted = round(raw * spec.approximate_ratio)
    return TokenCount(
        tokens=adjusted,
        encoding=spec.encoding,
        fidelity="approximate",
        note=spec.approximation_note,
    )
