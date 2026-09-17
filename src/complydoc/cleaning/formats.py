"""Safe copies of the formats whose text can be rewritten where it sits.

Plain text and Markdown are the text the scanner read, so a masked copy is
exact. HTML and email are assembled from many small pieces, and each piece is
masked on its own, which is noted on the result: an identifier written across
two elements is not seen as one value by a scan of either.
"""

from __future__ import annotations

from pathlib import Path

from complydoc.cleaning import CleanChange, CleanResult
from complydoc.config.schema import Config
from complydoc.extraction.extract import mask_matches
from complydoc.sensitive.scanner import scan_text

__all__ = ["clean_email_file", "clean_html_file", "clean_text_file"]

_SPLIT_NOTE = (
    "Each piece of text was masked on its own, so an identifier written across "
    "two of them was not seen as one value."
)


def _mask(
    text: str, settings: Config, where: str = "", into: list[CleanChange] | None = None
) -> tuple[str, int, int, dict[str, str]]:
    """`text` with its identifiers masked, the counts, and what could not be scanned.

    With `into`, each identifier covered over is recorded there, said in terms of
    `where` it sat. Only the masked form is kept.
    """
    if not text.strip():
        return text, 0, 0, {}
    matches, unavailable = scan_text(text, settings.sensitive)
    masked, replaced, confirmed = mask_matches(text, matches)
    if into is not None:
        for match in matches:
            place = f"{where} line {match.line}" if where else f"line {match.line}"
            into.append(
                CleanChange(
                    category=match.category,
                    label=match.label,
                    masked=match.masked,
                    where=place.strip(),
                )
            )
    return masked, replaced, confirmed, unavailable


def clean_text_file(source: Path, target: Path, format_name: str, settings: Config) -> CleanResult:
    """A .txt or .md copy with its identifiers masked."""
    from complydoc.ingest.base import LoaderError
    from complydoc.ingest.text import read_text

    result = CleanResult(source=source, format=format_name)
    try:
        text, note = read_text(source)
    except LoaderError as exc:
        result.skipped = str(exc)
        return result
    if note:
        result.notes.append(note)

    masked, replaced, confirmed, unavailable = _mask(text, settings, into=result.changes)
    target.write_text(masked, encoding="utf-8")

    result.output = target
    result.masked = replaced
    result.masked_confirmed = confirmed
    result.unscanned_categories = unavailable
    return result


def clean_html_file(source: Path, target: Path, settings: Config) -> CleanResult:
    """An HTML copy with the identifiers in its text nodes masked.

    Comments are removed: they are not shown to a reader, they are read by
    loaders, and the hidden-content check reports instructions found in them.
    """
    from lxml import etree
    from lxml import html as lxml_html

    result = CleanResult(source=source, format="html")
    try:
        data = source.read_bytes()
    except OSError as exc:
        result.skipped = f"the file could not be read ({exc})"
        return result
    if not data.strip():
        result.skipped = "the file is empty"
        return result

    try:
        root = lxml_html.fromstring(data)
    except (etree.ParserError, etree.XMLSyntaxError) as exc:
        result.skipped = f"the file could not be parsed as HTML ({exc})"
        return result

    replaced = confirmed = 0
    unavailable: dict[str, str] = {}
    comments = 0

    for node in list(root.iter()):
        if isinstance(node, lxml_html.HtmlComment):
            parent = node.getparent()
            if parent is not None:
                # A comment's tail is text that follows it in the document.
                if node.tail:
                    previous = node.getprevious()
                    if previous is not None:
                        previous.tail = (previous.tail or "") + node.tail
                    else:
                        parent.text = (parent.text or "") + node.tail
                parent.remove(node)
                comments += 1
            continue
        for attribute in ("text", "tail"):
            value = getattr(node, attribute, None)
            if not value or not value.strip():
                continue
            tag = getattr(node, "tag", "")
            place = f"<{tag}>" if isinstance(tag, str) and tag else "text"
            masked, count, sure, missing = _mask(value, settings, place, result.changes)
            setattr(node, attribute, masked)
            replaced += count
            confirmed += sure
            unavailable.update(missing)

    target.write_bytes(lxml_html.tostring(root, encoding="utf-8"))

    result.output = target
    result.masked = replaced
    result.masked_confirmed = confirmed
    result.unscanned_categories = unavailable
    result.notes.append(_SPLIT_NOTE)
    if comments:
        result.metadata_removed.append(f"{comments} HTML comment(s)")
    return result


_MASKED_HEADERS = ("Subject",)
"""Headers whose value is free text, where a masked value is still a value."""

_REMOVED_HEADERS = ("From", "To", "Cc", "Bcc", "Reply-To")
"""Headers whose value is an address, which a masked value cannot be."""


def clean_email_file(source: Path, target: Path, settings: Config) -> CleanResult:
    """An .eml copy with its text parts masked and its address headers removed.

    An address is an identifier, and a masked address is not an address: the
    mask characters are not allowed in an addr-spec, and an encoded word is not
    allowed there either, so a masked `From` is a header that some versions of
    the email library refuse to write at all. The copy drops those headers and
    reports them rather than writing something malformed into them.

    Attachments are carried over untouched. They are separate documents, and a
    copy that quietly rewrote them would say nothing about what it had changed.
    """
    from email import policy
    from email.parser import BytesParser

    result = CleanResult(source=source, format="email")
    try:
        message = BytesParser(policy=policy.default).parse(source.open("rb"))
    except OSError as exc:
        result.skipped = f"the file could not be read ({exc})"
        return result
    except Exception as exc:  # the email parser raises a wide range on bad input
        result.skipped = f"the file could not be parsed as an email ({exc})"
        return result

    replaced = confirmed = 0
    unavailable: dict[str, str] = {}
    attachments = 0

    for part in message.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if part.get_content_disposition() == "attachment":
            attachments += 1
            continue
        if part.get_content_maintype() != "text":
            continue
        try:
            content = part.get_content()
        except (LookupError, ValueError):
            continue
        masked, count, sure, missing = _mask(
            content, settings, part.get_content_type(), result.changes
        )
        if count:
            part.set_content(masked, subtype=part.get_content_subtype())
        replaced += count
        confirmed += sure
        unavailable.update(missing)

    for header in _MASKED_HEADERS:
        value = message.get(header)
        if not value:
            continue
        masked, count, sure, missing = _mask(
            str(value), settings, f"{header} header", result.changes
        )
        if count:
            del message[header]
            message[header] = masked
            replaced += count
            confirmed += sure
        unavailable.update(missing)

    removed = [header for header in _REMOVED_HEADERS if message.get(header)]
    for header in removed:
        del message[header]

    target.write_bytes(message.as_bytes())

    result.output = target
    result.masked = replaced
    result.masked_confirmed = confirmed
    result.unscanned_categories = unavailable
    result.notes.append(_SPLIT_NOTE)
    if removed:
        result.metadata_removed.extend(f"{header} header" for header in removed)
    if attachments:
        result.notes.append(
            f"{attachments} attachment(s) were copied unchanged; audit and clean them separately."
        )
    return result
