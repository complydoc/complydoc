"""Area coverage helpers shared by the ingest layer and the readiness signals."""

from __future__ import annotations

import math
from collections.abc import Iterable

import numpy as np

from complydoc.ingest.base import Rect

__all__ = ["coverage_fraction"]


def coverage_fraction(rects: Iterable[Rect], width: float, height: float, grid: int = 240) -> float:
    """Fraction of the page covered by `rects`, in the range 0.0 to 1.0.

    Rasterises onto a coarse grid, because text and image boxes overlap and a
    sum of areas can exceed 100%.
    """
    if width <= 0 or height <= 0:
        return 0.0
    boxes = [r for r in rects if r.area > 0]
    if not boxes:
        return 0.0

    mask = np.zeros((grid, grid), dtype=bool)
    # Plain min/max: np.clip on a scalar was fourteen times slower here.
    scale_x, scale_y = grid / width, grid / height
    for rect in boxes:
        col0 = max(0, min(grid, int(rect.x0 * scale_x)))
        col1 = max(0, min(grid, math.ceil(rect.x1 * scale_x)))
        row0 = max(0, min(grid, int(rect.y0 * scale_y)))
        row1 = max(0, min(grid, math.ceil(rect.y1 * scale_y)))
        if col1 > col0 and row1 > row0:
            mask[row0:row1, col0:col1] = True
    return float(mask.sum()) / float(grid * grid)
