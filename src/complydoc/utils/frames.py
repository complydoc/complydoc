"""Rows as a pandas DataFrame."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

__all__ = ["to_frame"]


def to_frame(rows: Sequence[dict[str, Any]], columns: Sequence[str]) -> Any:
    """A DataFrame with `columns`, kept when `rows` is empty. Requires the `notebook` extra."""
    try:
        import pandas as pd
    except ImportError as exc:
        raise ImportError("to_pandas needs pandas: pip install 'complydoc[notebook]'") from exc
    return pd.DataFrame(list(rows), columns=list(columns))
