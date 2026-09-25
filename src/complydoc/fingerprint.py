"""Stable names for findings, so a person can say "not this one" and have it stick.

A fingerprint is the same on every run that finds the same thing, on any
machine, and does not contain what was found. An identifier's is taken from its
category and its value, so the same account number is the same finding in every
document it appears in; a passage's from its words.

A fingerprint is a hash, not a secret. An identifier with few possible values —
a six-digit sort code — can be recovered from its fingerprint by trying them
all, so a fingerprint is as sensitive as the last digits a masked value shows,
and no more private than that.
"""

from __future__ import annotations

import hashlib
import re

__all__ = ["identifier_fingerprint", "passage_fingerprint"]

_SEPARATORS = re.compile(r"[\s\-_.·/]+")


def _digest(*parts: str) -> str:
    return hashlib.sha256("\0".join(("complydoc", *parts)).encode("utf-8")).hexdigest()[:16]


def identifier_fingerprint(category: str, value: str) -> str:
    """`id-` and 16 hex characters. Spacing, dashes and case do not change it.

    "GB29 NWBK 6016 1331 9268 19" and "gb29nwbk60161331926819" are one account.
    """
    return "id-" + _digest("identifier", category, _SEPARATORS.sub("", value).casefold())


def passage_fingerprint(text: str) -> str:
    """`ct-` and 16 hex characters, from the passage's words and nothing between them."""
    return "ct-" + _digest("passage", " ".join(text.split()).casefold())
