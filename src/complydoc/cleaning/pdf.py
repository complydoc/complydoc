"""Safe copies of PDFs: metadata stripped, and optionally the text layer with it.

A PDF draws its text at coordinates rather than storing a stream of characters,
so there is no place to write a masked value back into without laying the page
out again. Two things are offered instead, and the difference between them is
stated plainly on the result, because a copy that looks redacted and is not is
worse than no copy.

Drawing black rectangles over words is never done here. The rectangle is an
annotation painted above the page; the characters stay in the content stream,
where selecting the area, copying it, or reading the file with any library
returns them in full.
"""

from __future__ import annotations

from pathlib import Path

from complydoc.cleaning import CleanResult
from complydoc.config.schema import Config

__all__ = ["clean_pdf_file"]

_KEPT_TEXT_NOTE = (
    "The text layer is unchanged: identifiers in the page text are still there, "
    "in full. Pass rasterise to render the pages to images and rebuild the file "
    "without it."
)
_RASTER_NOTE = (
    "Every page was rendered to an image and the file rebuilt from those, so no "
    "text layer survives. Nothing in the copy can be selected, searched or read "
    "by a text extractor, and a model reading it needs OCR or vision."
)


def clean_pdf_file(
    source: Path, target: Path, settings: Config, *, rasterise: bool = False
) -> CleanResult:
    del settings  # A PDF copy masks nothing: see the module docstring.
    result = CleanResult(source=source, format="pdf")
    try:
        if rasterise:
            _rasterise(source, target, result)
        else:
            _strip_metadata(source, target, result)
    except Exception as exc:
        result.output = None
        result.skipped = f"the file could not be rewritten ({type(exc).__name__}: {exc})"
        target.unlink(missing_ok=True)
    return result


def _strip_metadata(source: Path, target: Path, result: CleanResult) -> None:
    import pypdf

    reader = pypdf.PdfReader(str(source))
    # An encrypted file that will not open has nothing that can be copied.
    if reader.is_encrypted and not reader.decrypt(""):
        result.skipped = "the file is encrypted"
        return

    writer = pypdf.PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    existing = dict(reader.metadata or {})
    writer.add_metadata({})
    with target.open("wb") as handle:
        writer.write(handle)

    result.output = target
    result.metadata_removed = sorted(str(key).lstrip("/") for key in existing)
    result.notes.append(_KEPT_TEXT_NOTE)


def _rasterise(source: Path, target: Path, result: CleanResult) -> None:
    import pypdf
    import pypdfium2 as pdfium
    from PIL import Image

    document = pdfium.PdfDocument(str(source))
    pages: list[Image.Image] = []
    try:
        for index in range(len(document)):
            page = document[index]
            pages.append(page.render(scale=150 / 72).to_pil().convert("RGB"))
    finally:
        document.close()

    if not pages:
        result.skipped = "the file has no pages to render"
        return

    pages[0].save(target, "PDF", resolution=150.0, save_all=len(pages) > 1, append_images=pages[1:])

    reader = pypdf.PdfReader(str(source))
    result.output = target
    result.metadata_removed = sorted(str(key).lstrip("/") for key in dict(reader.metadata or {}))
    result.notes.append(_RASTER_NOTE)
