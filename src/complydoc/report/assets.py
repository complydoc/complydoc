"""What every HTML page complydoc writes shares: the templates, the mark and the favicon.

Pages are self-contained, so the mark and the favicon are inlined rather than
linked, and the stylesheet and script are included from the template folder.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from jinja2 import Environment, FileSystemLoader

__all__ = ["FAVICON_URI", "LOGO_SVG", "TEMPLATE_DIR", "template_environment"]

TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "ui"
"""Templates, `report.css` and `report.js`."""

# The mark: a check whose strokes are two leaves, with a dot above the short one.
# Its geometry and the reasoning behind it are in brand/logo/README.md.
_MARK_PATH = (
    "M35 84A30 30 0 0 1 9 58A30 30 0 0 1 35 84Z"
    "M43 84A72 72 0 0 1 93 20A72 72 0 0 1 43 84Z"
    "M11 34a13 13 0 1 0 26 0a13 13 0 1 0 -26 0Z"
)

# The mark beside the name, in the page's own colours.
LOGO_SVG = (
    '<svg class="logo" viewBox="0 0 250 64" width="188" height="48" role="img" '
    'aria-label="complydoc">'
    '<path fill="var(--accent)" fill-rule="evenodd" '
    f'transform="translate(4 10) scale(0.6875) translate(-9 -20)" d="{_MARK_PATH}"/>'
    '<text x="70" y="43" fill="var(--ink)" font-size="30" font-weight="600" '
    "font-family=\"-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif\" "
    'letter-spacing="-0.02em">complydoc</text>'
    "</svg>"
)

# The mark on the dark tile, as a data URI.
_FAVICON_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'
    '<rect width="128" height="128" rx="28" fill="#0b1512"/>'
    '<path fill="#4cc38a" fill-rule="evenodd" '
    f'transform="translate(64 64) scale(1.05) translate(-51 -52)" d="{_MARK_PATH}"/>'
    "</svg>"
)
FAVICON_URI = "data:image/svg+xml," + quote(_FAVICON_SVG, safe="")


def template_environment() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        # Every value is escaped unless marked safe. Document text, file names and
        # metadata come from the documents, and a page must not run markup a
        # document put there. `select_autoescape(["html"])` matched nothing, since
        # the templates are named `.html.j2`.
        autoescape=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )
