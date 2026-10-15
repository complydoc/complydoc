"""Whether a table survived extraction as a table.

A page's text is what a model is given. A table detected on the page has a grid,
and the question this answers is whether that grid is still legible in the text:

    | Supplier | Rating |        Supplier Rating          <- intact, one line
    | Acme     | B      |   ->   Acme B

    | Supplier | Rating |        Supplier                 <- split, one cell a line
    | Acme     | B      |        Rating
                                 Acme

A row counts as intact when its non-empty cells appear on one line of the text,
in the order the grid has them. A grid row whose cells each stack the same number
of lines is several rows the extractor merged, and each is compared on its own.

Broken tables are a common cause of wrong answers downstream, and this is the
cheapest honest measurement of it: the grid comes from the extractor that found
the table, and the text is the one the run kept.

Both come from the same extractor, because only an extractor that reads table
structure detects a table at all. So this measures how well that extractor's own
text preserves the grid it found; it is not a verdict on extractors that were not
used, even though those are often the ones that lose a table.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

__all__ = ["compare_rows"]

_SPACE = re.compile(r"\s+")
_TOKEN = re.compile(r"\w+")


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.casefold())


def _row_is_intact(cells: list[list[str]], lines: list[list[str]]) -> bool:
    """Whether one line's tokens hold these cells' tokens, in order.

    Matched as whole tokens: a cell of "B" must be its own word, or a rating
    column would match the B in "Bank" and every table would look intact.
    """
    for line in lines:
        position = 0
        for cell in cells:
            found = _find(line, cell, position)
            if found < 0:
                break
            position = found + len(cell)
        else:
            return True
    return False


def _find(line: list[str], cell: list[str], start: int) -> int:
    """Where `cell`'s tokens appear in `line`, at or after `start`."""
    for index in range(start, len(line) - len(cell) + 1):
        if line[index : index + len(cell)] == cell:
            return index
    return -1


def compare_rows(grid: Sequence[Sequence[str | None]], text: str) -> tuple[int, int]:
    """(rows intact, rows compared) for one table's grid against a page's text.

    A row of fewer than two non-empty cells is not compared: it carries no column
    structure to lose.
    """
    if not grid or not text.strip():
        return 0, 0
    lines = [_tokens(line) for line in text.splitlines() if line.strip()]
    lines = [line for line in lines if line]
    intact = compared = 0
    for row in grid:
        for cells in _rows_in(row):
            if len(cells) < 2:
                continue
            compared += 1
            intact += _row_is_intact(cells, lines)
    return intact, compared


def _rows_in(row: Sequence[str | None]) -> list[list[list[str]]]:
    """One grid row's cells as tokens, or several rows where the grid merged them.

    A table drawn without lines between its rows can come back as one row whose
    cells each hold every row's value, a line apiece. When every cell has the same
    number of lines, each line is compared as the row it is on the page.
    """
    filled = [str(cell) for cell in row if cell and str(cell).strip()]
    stacked = [[line for line in cell.splitlines() if line.strip()] for cell in filled]
    depth = len(stacked[0]) if stacked else 0
    # A row whose cells all wrap to the same number of lines looks the same, and is
    # split too, on purpose: the page's text sets such a row one line at a time.
    if len(stacked) >= 2 and depth >= 2 and all(len(cell) == depth for cell in stacked):
        split = [[_tokens(cell[i]) for cell in stacked] for i in range(depth)]
        # A line that is only a dash is an empty value, as an empty cell is.
        return [[tokens for tokens in cells if tokens] for cells in split]
    return [[tokens for tokens in map(_tokens, filled) if tokens]]
