"""Safe copies of documents, with identifiers masked and metadata removed.

    import complydoc as cd

    cd.clean_document("contract.docx", "clean/")

A cleaned copy is the same document with every identifier complydoc found
replaced by its masked form, and the metadata the file carries removed. It is
meant for the case where a document has to reach a model, a vendor or a ticket,
and the values in it should not.

What a copy is worth depends on what detection found, and detection is measured
rather than assumed: see Detection accuracy for what it finds and what it misses.
A category that could not be scanned at all is reported on the result, because
nothing of that kind was masked anywhere in the file.

PDFs are the exception to masking. Text in a PDF is drawn at coordinates rather
than stored as a stream of characters, so a copy cannot have its text rewritten
in place without re-laying out the page. Drawing a black rectangle over the
words leaves the text underneath, where any reader can still select it, so that
is never done. A PDF copy has its metadata stripped, and `rasterise=True`
renders each page to an image and rebuilds the file from those, which removes
the text layer along with everything else in it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from complydoc.config.schema import Config

__all__ = ["CleanResult", "clean_document", "cleanable_formats"]

_BY_SUFFIX: dict[str, str] = {
    ".txt": "text",
    ".md": "markdown",
    ".markdown": "markdown",
    ".html": "html",
    ".htm": "html",
    ".eml": "email",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".xlsm": "xlsx",
    ".pptx": "pptx",
    ".pdf": "pdf",
}


def cleanable_formats() -> list[str]:
    """The file extensions a safe copy can be made of."""
    return sorted(_BY_SUFFIX)


@dataclass(slots=True)
class CleanResult:
    """What was written, and what was done to it."""

    source: Path
    format: str
    output: Path | None = None
    masked: int = 0
    """Identifiers replaced by their masked form."""
    masked_confirmed: int = 0
    """The subset of those that passed a checksum."""
    metadata_removed: list[str] = field(default_factory=list)
    """Metadata keys and parts taken out of the copy."""
    unscanned_categories: dict[str, str] = field(default_factory=dict)
    """Categories nothing was looked for, so none of that kind were masked."""
    notes: list[str] = field(default_factory=list)
    """What the copy does not cover, in the caller's own terms."""
    skipped: str | None = None
    """Set when no copy was written, with the reason."""

    @property
    def written(self) -> bool:
        return self.output is not None


def clean_document(
    path: str | Path,
    out_dir: str | Path,
    config: Config | None = None,
    *,
    rasterise: bool = False,
) -> CleanResult:
    """Write a safe copy of `path` into `out_dir`, and say what was done to it.

    `rasterise` applies to PDFs only: each page is rendered to an image and the
    file rebuilt from those, so the text layer does not survive.
    """
    from complydoc import offline
    from complydoc.extraction.strings import resolve_config

    offline.arm()
    source = Path(path).expanduser()
    settings = resolve_config(config)
    destination = Path(out_dir).expanduser()

    format_name = _BY_SUFFIX.get(source.suffix.lower())
    if format_name is None:
        return CleanResult(
            source=source,
            format="other",
            skipped=f"no safe copy is made of {source.suffix or 'a file with no extension'}",
        )
    if not source.is_file():
        return CleanResult(source=source, format=format_name, skipped="no such file")

    destination.mkdir(parents=True, exist_ok=True)
    target = destination / source.name

    if format_name in {"text", "markdown"}:
        from complydoc.cleaning.formats import clean_text_file

        return clean_text_file(source, target, format_name, settings)
    if format_name == "html":
        from complydoc.cleaning.formats import clean_html_file

        return clean_html_file(source, target, settings)
    if format_name == "email":
        from complydoc.cleaning.formats import clean_email_file

        return clean_email_file(source, target, settings)
    if format_name in {"docx", "xlsx", "pptx"}:
        from complydoc.cleaning.office import clean_office_file

        return clean_office_file(source, target, format_name, settings)

    from complydoc.cleaning.pdf import clean_pdf_file

    return clean_pdf_file(source, target, settings, rasterise=rasterise)
