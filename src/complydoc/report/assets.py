"""What every HTML page complydoc writes shares: the templates, the mark and the favicon.

Pages are self-contained, so the mark and the favicon are inlined rather than
linked, and the stylesheet and script are included from the template folder.
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader

__all__ = ["FAVICON_URI", "LOGO_SVG", "TEMPLATE_DIR", "template_environment"]

TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "ui"
"""Templates, `report.css` and `report.js`."""

# A document inside the network guard boundary, with one line redacted.
LOGO_SVG = (
    '<svg class="logo" viewBox="0 0 296 64" width="222" height="48" role="img" '
    'aria-label="complydoc">'
    '<rect x="8" y="12" width="40" height="40" rx="8" fill="none" stroke="var(--accent)" '
    'stroke-width="1.5" stroke-dasharray="3,3"/>'
    '<rect x="20" y="21" width="16" height="22" rx="2" fill="none" stroke="var(--ink)" '
    'stroke-width="1.5"/>'
    '<line x1="23" y1="27" x2="33" y2="27" stroke="var(--ink)" stroke-width="1.5"/>'
    '<line x1="23" y1="32" x2="33" y2="32" stroke="var(--ink)" stroke-width="1.5"/>'
    '<line x1="23" y1="37" x2="29" y2="37" stroke="var(--accent)" stroke-width="1.5"/>'
    '<text x="62" y="41" fill="var(--ink)" font-size="27" font-weight="600" '
    "font-family=\"-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif\" "
    'letter-spacing="-0.02em">complydoc</text>'
    "</svg>"
)

# The mark alone, as a data URI.
FAVICON_URI = (
    "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox"
    "%3D%220%200%2048%2048%22%3E%3Crect%20width%3D%2248%22%20height%3D%2248%22%20rx%3D%229%22"
    "%20fill%3D%22%23fbfbfa%22%2F%3E%3Crect%20x%3D%225%22%20y%3D%225%22%20width%3D%2238%22%20"
    "height%3D%2238%22%20rx%3D%227%22%20fill%3D%22none%22%20stroke%3D%22%231a7f4b%22%20stroke"
    "-width%3D%222.5%22%20stroke-dasharray%3D%224%2C3%22%2F%3E%3Crect%20x%3D%2216%22%20y%3D%2"
    "213%22%20width%3D%2216%22%20height%3D%2222%22%20rx%3D%222%22%20fill%3D%22none%22%20strok"
    "e%3D%22%2322272e%22%20stroke-width%3D%222.5%22%2F%3E%3Cline%20x1%3D%2219%22%20y1%3D%2219"
    "%22%20x2%3D%2229%22%20y2%3D%2219%22%20stroke%3D%22%2322272e%22%20stroke-width%3D%222.5%2"
    "2%2F%3E%3Cline%20x1%3D%2219%22%20y1%3D%2224%22%20x2%3D%2229%22%20y2%3D%2224%22%20stroke%"
    "3D%22%2322272e%22%20stroke-width%3D%222.5%22%2F%3E%3Cline%20x1%3D%2219%22%20y1%3D%2229%2"
    "2%20x2%3D%2225%22%20y2%3D%2229%22%20stroke%3D%22%231a7f4b%22%20stroke-width%3D%222.5%22%"
    "2F%3E%3C%2Fsvg%3E"
)


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
