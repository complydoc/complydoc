"""Markup that hides text in HTML, Markdown, PowerPoint and email.

As for Word, visibility is read from the markup rather than from a rendering.

- HTML: the `hidden` attribute, `display: none`, `visibility: hidden`,
  `opacity: 0`, transparent text, white text with no background set on it or an
  ancestor, text below the minimum size, zero height with hidden overflow, and
  comments. Styles come from `style` attributes and from `<style>` rules whose
  selector is a tag, a class, an id, or a tag with a class or id. Text placed far
  off screen is reported as suspected, since that depends on the layout.
- Markdown: HTML comments and link references used as comments, which are not
  rendered, and inline HTML hidden as above. Code blocks are ignored.
- PowerPoint: hidden slides, shapes placed outside the slide, and text below the
  minimum size.
- Email: the HTML body, checked as HTML.

Web pages and Markdown routinely hide menus, dialogs, licence notices and
comments, so a passage hidden in HTML or Markdown is reported only when it reads
as an instruction. PowerPoint passages are reported whatever they say.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from lxml import etree
from lxml import html as lxml_html

from complydoc.config.schema import VisibilityConfig
from complydoc.hidden.visibility import HiddenRun
from complydoc.ingest.base import LoaderError
from complydoc.ingest.html import SKIPPED_TAGS, html_text, parse_html

__all__ = [
    "eml_hidden_runs",
    "html_hidden_runs",
    "html_markup_hidden_runs",
    "markdown_hidden_runs",
    "markdown_text_hidden_runs",
    "pptx_hidden_runs",
]

_MAX_TEXT = 2000
_OFF_SCREEN_PT = 500.0
_DECLARATION = re.compile(r"([a-zA-Z-]+)\s*:\s*([^;]+)")
_RULE = re.compile(r"([^{}@]+)\{([^{}]*)\}")
_CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
_SELECTOR = re.compile(r"^([a-zA-Z][a-zA-Z0-9]*)?(?:([.#])([\w-]+))?$")
_LENGTH = re.compile(r"^(-?\d*\.?\d+)\s*(px|pt|em|rem|%)?$")
_HEX = re.compile(r"#([0-9a-f]{3}|[0-9a-f]{6})")
_RGB = re.compile(r"rgba?\((\d+),(\d+),(\d+)(?:,[\d.]+)?\)")

_FENCE = re.compile(r"^(```|~~~).*?^\1[ \t]*$", re.S | re.M)
_INLINE_CODE = re.compile(r"`[^`\n]+`")
_HTML_COMMENT = re.compile(r"<!--(.*?)-->", re.S)
_REFERENCE_COMMENT = re.compile(
    r"^[ \t]*\[[^\]]*\]:[ \t]*(?:#|<>)[ \t]*[(\"'](.*)[)\"'][ \t]*$", re.M
)
_TAG = re.compile(r"<[a-zA-Z][^>]*>")

Rule = tuple[str | None, str | None, dict[str, str]]


def _letters(text: str) -> int:
    return sum(c.isalnum() for c in text)


def _add(
    runs: list[HiddenRun],
    text: str,
    visibility: str,
    reasons: list[str],
    config: VisibilityConfig,
    page: int | None = None,
    routine: bool = False,
) -> None:
    text = " ".join(text.split())
    if _letters(text) >= config.min_characters:
        runs.append(
            HiddenRun(
                page, text[:_MAX_TEXT], visibility, list(reasons), only_if_instruction=routine
            )
        )


# --------------------------------------------------------------------------- HTML


def _declarations(style: str | None) -> dict[str, str]:
    return {
        name.lower(): value.replace("!important", "").strip().lower()
        for name, value in _DECLARATION.findall(style or "")
    }


def _stylesheet(root: Any) -> list[Rule]:
    rules: list[Rule] = []
    for style in root.iter("style"):
        css = _CSS_COMMENT.sub("", style.text or "")
        for selectors, body in _RULE.findall(css):
            declarations = _declarations(body)
            if not declarations:
                continue
            for selector in selectors.split(","):
                match = _SELECTOR.match(selector.strip())
                if match is None or not selector.strip():
                    continue
                tag, marker, name = match.groups()
                rules.append(
                    (
                        tag.lower() if tag else None,
                        f"{marker}{name}" if marker else None,
                        declarations,
                    )
                )
    return rules


def _computed(node: Any, tag: str, rules: list[Rule]) -> dict[str, str]:
    classes = {f".{name}" for name in (node.get("class") or "").split()}
    ident = f"#{node.get('id')}" if node.get("id") else None
    declarations: dict[str, str] = {}
    for rule_tag, name, body in rules:
        if rule_tag is not None and rule_tag != tag:
            continue
        if name is not None and name not in classes and name != ident:
            continue
        declarations.update(body)
    declarations.update(_declarations(node.get("style")))
    return declarations


def _number(value: str | None) -> float | None:
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def _points(value: str | None) -> float | None:
    match = _LENGTH.match((value or "").strip())
    if match is None:
        return None
    number, unit = float(match.group(1)), match.group(2) or "px"
    if unit == "pt":
        return number
    if unit == "px":
        return number * 0.75
    # A relative size can only be measured when it is zero.
    return 0.0 if number == 0 else None


def _white(value: str, config: VisibilityConfig) -> bool:
    compact = value.replace(" ", "")
    if compact == "white":
        return True
    if hex_match := _HEX.fullmatch(compact):
        digits = hex_match.group(1)
        digits = "".join(c * 2 for c in digits) if len(digits) == 3 else digits
        channels = [int(digits[i : i + 2], 16) for i in (0, 2, 4)]
    elif rgb_match := _RGB.fullmatch(compact):
        channels = [int(v) for v in rgb_match.groups()]
    else:
        return False
    return min(channels) >= int(config.near_white * 255)


def _hiding(
    node: Any, declarations: dict[str, str], background: bool, config: VisibilityConfig
) -> tuple[list[str], list[str]]:
    confirmed: list[str] = []
    suspected: list[str] = []
    if node.get("hidden") is not None:
        confirmed.append("hidden attribute")
    if declarations.get("display") == "none":
        confirmed.append("display: none")
    if declarations.get("visibility") in ("hidden", "collapse"):
        confirmed.append("visibility: hidden")
    opacity = _number(declarations.get("opacity"))
    if opacity is not None and opacity <= 0.01:
        confirmed.append("opacity: 0")
    color = declarations.get("color")
    if color == "transparent":
        confirmed.append("transparent text")
    elif color and _white(color, config) and not background:
        confirmed.append("white text")
    size = _points(declarations.get("font-size"))
    if size is not None and size < config.min_font_size_pt:
        confirmed.append(f"font size below {config.min_font_size_pt:g}pt")
    if declarations.get("overflow") == "hidden" and 0.0 in (
        _points(declarations.get("height")),
        _points(declarations.get("max-height")),
    ):
        confirmed.append("zero height with overflow hidden")
    for offset in ("left", "top", "text-indent", "margin-left"):
        placed = _points(declarations.get(offset))
        if placed is not None and placed <= -_OFF_SCREEN_PT:
            suspected.append("positioned off screen")
            break
    return confirmed, suspected


def _walk(root: Any, config: VisibilityConfig) -> list[HiddenRun]:
    rules = _stylesheet(root)
    runs: list[HiddenRun] = []

    def visit(node: Any, background: bool) -> None:
        if node.tag is etree.Comment:
            _add(runs, node.text or "", "confirmed", ["HTML comment"], config, routine=True)
            return
        if not isinstance(node.tag, str):
            return
        tag = node.tag.lower()
        if tag in SKIPPED_TAGS:
            return
        declarations = _computed(node, tag, rules)
        shaded = (
            background
            or node.get("bgcolor") is not None
            or any(
                k in declarations for k in ("background", "background-color", "background-image")
            )
        )
        confirmed, suspected = _hiding(node, declarations, shaded, config)
        if confirmed or suspected:
            # Everything inside a hidden element is hidden with it, and reported once.
            _add(runs, html_text(node), "confirmed" if confirmed else "suspected",
                 confirmed or suspected, config, routine=True)  # fmt: skip
            return
        for child in node:
            visit(child, shaded)

    for sibling in reversed(list(root.itersiblings(preceding=True))):
        visit(sibling, False)
    visit(root, False)
    return runs


def html_markup_hidden_runs(markup: str | bytes, config: VisibilityConfig) -> list[HiddenRun]:
    """Hidden passages in an HTML document given as a string or bytes."""
    if not markup.strip():
        return []
    return _walk(parse_html(markup), config)


def html_hidden_runs(
    path: Path, config: VisibilityConfig
) -> tuple[list[HiddenRun], list[str], bool]:
    try:
        return html_markup_hidden_runs(path.read_bytes(), config), [], True
    except (OSError, LoaderError) as exc:
        return [], [f"the file could not be parsed to check for hidden text ({exc})"], False


# ----------------------------------------------------------------------- Markdown


def markdown_text_hidden_runs(text: str, config: VisibilityConfig) -> list[HiddenRun]:
    """Hidden passages in Markdown text, ignoring code blocks and inline code."""

    def blank(match: re.Match[str]) -> str:
        return " " * len(match.group(0))

    text = _INLINE_CODE.sub(blank, _FENCE.sub(blank, text))
    runs: list[HiddenRun] = []
    for match in _HTML_COMMENT.finditer(text):
        reason = "HTML comment, not shown when the Markdown is rendered"
        _add(runs, match.group(1), "confirmed", [reason], config, routine=True)
    for match in _REFERENCE_COMMENT.finditer(text):
        reason = "link reference used as a comment, not shown when the Markdown is rendered"
        _add(runs, match.group(1), "confirmed", [reason], config, routine=True)
    rest = _HTML_COMMENT.sub(" ", text)
    if _TAG.search(rest):
        try:
            root = lxml_html.fragment_fromstring(rest, create_parent="div")
        except (etree.ParserError, ValueError):
            return runs
        runs.extend(_walk(root, config))
    return runs


def markdown_hidden_runs(
    path: Path, config: VisibilityConfig
) -> tuple[list[HiddenRun], list[str], bool]:
    from complydoc.ingest.text import read_text

    try:
        text, _note = read_text(path)
    except LoaderError as exc:
        return [], [f"the file could not be read to check for hidden text ({exc})"], False
    return markdown_text_hidden_runs(text, config), [], True


# --------------------------------------------------------------------- PowerPoint


def pptx_hidden_runs(
    path: Path, config: VisibilityConfig
) -> tuple[list[HiddenRun], list[str], bool]:
    from complydoc.ingest.pptx import read_presentation

    try:
        presentation = read_presentation(path)
    except LoaderError as exc:
        return [], [f"the file could not be opened to check for hidden text ({exc})"], False

    runs: list[HiddenRun] = []
    smallest = config.min_font_size_pt * 100
    for slide in presentation.slides:
        if slide.hidden:
            text = "\n".join(shape.text for shape in slide.shapes)
            _add(runs, text, "confirmed", ["hidden slide"], config, page=slide.number)
            continue
        for shape in slide.shapes:
            reasons: list[str] = []
            if shape.outside:
                reasons.append("placed outside the slide")
            if shape.largest_size is not None and shape.largest_size < smallest:
                reasons.append(f"font size below {config.min_font_size_pt:g}pt")
            if reasons:
                _add(runs, shape.text, "confirmed", reasons, config, page=slide.number)
    return runs, [], True


# -------------------------------------------------------------------------- Email


def eml_hidden_runs(
    path: Path, config: VisibilityConfig
) -> tuple[list[HiddenRun], list[str], bool]:
    from complydoc.ingest.eml import html_body, read_message

    try:
        markup = html_body(read_message(path))
    except LoaderError as exc:
        return [], [f"the file could not be opened to check for hidden text ({exc})"], False
    if markup is None:
        return [], [], True
    try:
        return html_markup_hidden_runs(markup, config), [], True
    except LoaderError as exc:
        return [], [f"the HTML body could not be parsed to check for hidden text ({exc})"], False
