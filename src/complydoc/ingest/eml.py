"""Email loader for `.eml` files.

The page text is the From, To, Cc, Date and Subject headers, then the body: the
plain text part when there is one, otherwise the HTML part as text. Attachments
are counted and not read; save and audit them separately. Outlook `.msg` files
are not supported.
"""

from __future__ import annotations

from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from pathlib import Path
from typing import cast

from complydoc.ingest.base import (
    Document,
    DocumentFormat,
    IngestOptions,
    LoaderError,
    Page,
    sha256_of,
)
from complydoc.ingest.html import html_tables, html_text, parse_html
from complydoc.ingest.registry import register
from complydoc.utils.text import count

__all__ = ["html_body", "message_text", "read_message"]

_HEADERS = ("From", "To", "Cc", "Date", "Subject")
_ENVELOPE = ("Message-ID", "Received", "MIME-Version")


def read_message(path: Path) -> EmailMessage:
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise LoaderError(f"the file could not be read ({exc})") from exc
    message = BytesParser(policy=policy.default).parsebytes(data)
    if not any(message.get(name) for name in (*_HEADERS, *_ENVELOPE)):
        raise LoaderError("the file has no email headers")
    return message


def _content(part: EmailMessage) -> str:
    try:
        content = part.get_content()
    except (LookupError, ValueError, AssertionError):
        payload = part.get_payload(decode=True)
        return payload.decode("utf-8", errors="replace") if isinstance(payload, bytes) else ""
    return content if isinstance(content, str) else ""


def html_body(message: EmailMessage) -> str | None:
    """The HTML part of the body, if there is one."""
    part = message.get_body(preferencelist=("html",))
    return _content(cast(EmailMessage, part)) if part is not None else None


def message_text(message: EmailMessage) -> tuple[str, bool]:
    """The headers and body as text, and whether the body came from HTML."""
    lines = [f"{name}: {message[name]}" for name in _HEADERS if message.get(name)]
    part = message.get_body(preferencelist=("plain", "html"))
    body, from_html = "", False
    if part is not None:
        body = _content(cast(EmailMessage, part))
        if part.get_content_type() == "text/html" and body.strip():
            body, from_html = html_text(parse_html(body)), True
    heading = "\n".join(lines)
    return (f"{heading}\n\n{body.strip()}" if body.strip() else heading), from_html


class EmlLoader:
    extensions: tuple[str, ...] = (".eml",)
    format: DocumentFormat = DocumentFormat.EMAIL

    def load(self, path: Path, options: IngestOptions) -> Document:
        message = read_message(path)
        document = Document(
            path=path, sha256=sha256_of(path), format=self.format, page_count_known=False
        )
        text, from_html = message_text(message)
        page = Page(number=1, width_pt=0.0, height_pt=0.0, text=text)
        page.text_source = "native" if text.strip() else "none"
        if from_html:
            markup = html_body(message)
            page.tables = html_tables(parse_html(markup)) if markup else []
        page.notes.append("An email has no pagination, so it is one logical page.")

        attachments = list(message.iter_attachments())
        if attachments:
            types = ", ".join(sorted({a.get_content_type() for a in attachments}))
            verb = "was" if len(attachments) == 1 else "were"
            document.load_warnings.append(
                f"{count(len(attachments), 'attachment')} ({types}) {verb} not read. Save "
                f"attachments and audit them separately."
            )
        if message.defects:
            document.load_warnings.append(
                f"The message has {count(len(message.defects), 'formatting defect')}, so "
                f"parts of it may be read incorrectly."
            )
        document.pages.append(page)
        return document


register(EmlLoader())
