"""Plain text and Markdown loaders.

The file is the text a model would be given, so it is read as it is, Markdown
syntax included. There is no pagination, so the whole file is one logical page.
"""

from __future__ import annotations

import codecs
import re
from pathlib import Path

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

__all__ = ["markdown_tables", "read_text"]

_TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
_TABLE_RULE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")


def read_text(path: Path) -> tuple[str, str | None]:
    """The file's text and, when it was not UTF-8, a note saying how it was decoded."""
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise LoaderError(f"the file could not be read ({exc})") from exc
    if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return data.decode("utf-16", errors="replace"), None
    if b"\x00" in data[:4096]:
        raise LoaderError("the file contains binary data rather than text")
    try:
        return data.decode("utf-8-sig"), None
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace"), (
            "The file is not valid UTF-8, so it was read as Windows-1252. Some characters "
            "may be wrong."
        )


def markdown_tables(text: str) -> list[TableInfo]:
    """Pipe tables: a header row, a rule row of dashes, and the rows under them."""
    lines = text.splitlines()
    tables: list[TableInfo] = []
    index = 0
    while index < len(lines) - 1:
        if _TABLE_ROW.match(lines[index]) and _TABLE_RULE.match(lines[index + 1]):
            cols = len(lines[index].strip().strip("|").split("|"))
            end = index + 2
            while end < len(lines) and _TABLE_ROW.match(lines[end]):
                end += 1
            tables.append(
                TableInfo(rows=end - index - 1, cols=cols, header_depth=1, merged_cells=0)
            )
            index = end
        else:
            index += 1
    return tables


def _load(path: Path, format: DocumentFormat, markdown: bool) -> Document:
    text, note = read_text(path)
    document = Document(path=path, sha256=sha256_of(path), format=format, page_count_known=False)
    page = Page(number=1, width_pt=0.0, height_pt=0.0, text=text)
    page.text_source = "native" if text.strip() else "none"
    if markdown:
        page.tables = markdown_tables(text)
    page.notes.append("A text file has no pagination, so the whole file is one logical page.")
    if note:
        document.load_warnings.append(note)
    document.pages.append(page)
    return document


class TextLoader:
    extensions: tuple[str, ...] = (".txt",)
    format: DocumentFormat = DocumentFormat.TEXT

    def load(self, path: Path, options: IngestOptions) -> Document:
        return _load(path, self.format, markdown=False)


class MarkdownLoader:
    extensions: tuple[str, ...] = (".md", ".markdown")
    format: DocumentFormat = DocumentFormat.MARKDOWN

    def load(self, path: Path, options: IngestOptions) -> Document:
        return _load(path, self.format, markdown=True)


register(TextLoader())
register(MarkdownLoader())
