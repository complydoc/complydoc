"""HTML loader.

The text is what an HTML loader passes on: every text node outside `script`,
`style`, `template` and `noscript`, with block elements on their own lines and
table cells separated by tabs. Text a browser would not show is included, as
loaders include it, and the hidden-content check reports it. The whole page is
one logical page.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from lxml import etree
from lxml import html as lxml_html

from complydoc.ingest.base import (
    Document,
    DocumentFormat,
    IngestOptions,
    LoaderError,
    Page,
    TableInfo,
    sha256_of,
)
from complydoc.ingest.registry import register
from complydoc.utils.text import count

__all__ = ["SKIPPED_TAGS", "html_tables", "html_text", "parse_html"]

SKIPPED_TAGS = frozenset({"script", "style", "template", "noscript"})
"""Elements whose content is never page text."""

_BLOCKS = frozenset(
    {
        "address", "article", "aside", "blockquote", "br", "caption", "dd", "details",
        "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1",
        "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p",
        "pre", "section", "summary", "table", "title", "tr", "ul",
    }
)  # fmt: skip
_CELLS = frozenset({"td", "th"})
_SPACE = re.compile(r"\s+")
_CELL_GAP = re.compile(r" *\t *")
_XML_DECLARATION = re.compile(r"^\s*<\?xml[^>]*\?>")
_FEW_LETTERS = 200


def parse_html(markup: str | bytes) -> Any:
    """The document element. Bytes are decoded as the page's own charset declares."""
    if isinstance(markup, str):
        # lxml refuses a string that still carries an encoding declaration.
        markup = _XML_DECLARATION.sub("", markup)
    try:
        return lxml_html.document_fromstring(markup)
    except (etree.ParserError, ValueError) as exc:
        raise LoaderError(f"the HTML could not be parsed ({exc})") from exc


def html_text(root: Any) -> str:
    """The text under `root`, one block per line, excluding scripts and styles."""
    parts: list[str] = []

    def visit(node: Any, preserve: bool) -> None:
        tag = node.tag.lower() if isinstance(node.tag, str) else None
        if tag is not None and tag not in SKIPPED_TAGS:
            keep = preserve or tag == "pre"
            if tag in _BLOCKS:
                parts.append("\n")
            elif tag in _CELLS:
                parts.append("\t")
            if node.text:
                parts.append(node.text if keep else _SPACE.sub(" ", node.text))
            for child in node:
                visit(child, keep)
            if tag in _BLOCKS:
                parts.append("\n")
        if node is not root and node.tail:
            parts.append(node.tail if preserve else _SPACE.sub(" ", node.tail))

    visit(root, False)
    lines = (_CELL_GAP.sub("\t", line).strip() for line in "".join(parts).split("\n"))
    return "\n".join(line for line in lines if line)


def _span(value: str | None) -> int:
    try:
        return min(max(int(value or 1), 1), 1000)
    except ValueError:
        return 1


def html_tables(root: Any) -> list[TableInfo]:
    """Tables of at least two rows and two columns, with header rows and merged cells."""
    tables: list[TableInfo] = []
    for table in root.iter("table"):
        rows = [row for row in table.iter("tr") if next(row.iterancestors("table"), None) is table]
        if len(rows) < 2:
            continue
        widths: list[int] = []
        merged = header = 0
        counting = True
        for row in rows:
            cells = [c for c in row if isinstance(c.tag, str) and c.tag.lower() in _CELLS]
            width = 0
            for cell in cells:
                columns, spanned_rows = _span(cell.get("colspan")), _span(cell.get("rowspan"))
                width += columns
                merged += columns * spanned_rows - 1
            widths.append(width)
            parent = row.getparent()
            in_head = parent is not None and parent.tag == "thead"
            if counting and (in_head or (cells and all(c.tag.lower() == "th" for c in cells))):
                header += 1
            else:
                counting = False
        cols = max(widths, default=0)
        if cols < 2:
            continue
        tables.append(
            TableInfo(rows=len(rows), cols=cols, header_depth=max(1, header), merged_cells=merged)
        )
    return tables


class HtmlLoader:
    extensions: tuple[str, ...] = (".html", ".htm")
    format: DocumentFormat = DocumentFormat.HTML

    def load(self, path: Path, options: IngestOptions) -> Document:
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise LoaderError(f"the file could not be read ({exc})") from exc
        document = Document(
            path=path, sha256=sha256_of(path), format=self.format, page_count_known=False
        )
        page = Page(number=1, width_pt=0.0, height_pt=0.0)
        if data.strip():
            root = parse_html(data)
            page.text = html_text(root)
            page.tables = html_tables(root)
            scripts = sum(1 for _ in root.iter("script"))
            if scripts and sum(c.isalnum() for c in page.text) < _FEW_LETTERS:
                document.load_warnings.append(
                    f"The page has little text and {count(scripts, 'script')}. Text a script "
                    f"adds in a browser is not in the file, so it was not read."
                )
        page.text_source = "native" if page.text.strip() else "none"
        page.notes.append("An HTML page has no fixed pagination, so it is one logical page.")
        document.pages.append(page)
        return document


register(HtmlLoader())
