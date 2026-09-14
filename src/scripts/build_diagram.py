"""Generate the complydoc architecture diagram, light and dark, from one geometry."""

from __future__ import annotations

from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / ".github" / "images"

LIGHT = dict(
    slug="complydoc-architecture",
    paper="#f5f5f5",
    paper2="#ececec",
    ink="#22272e",
    muted="#4f5d75",
    soft="#7a8399",
    rule="rgba(34,39,46,0.12)",
    zone_fill="rgba(34,39,46,0.02)",
    zone_stroke="rgba(34,39,46,0.10)",
    zone_label="rgba(34,39,46,0.40)",
    store_fill="rgba(34,39,46,0.05)",
    input_fill="rgba(79,93,117,0.10)",
    accent="#1a7f4b",
    accent_tint="rgba(26,127,75,0.08)",
    accent_stroke="rgba(26,127,75,0.55)",
    accent_wash="rgba(26,127,75,0.04)",
)
DARK = dict(
    slug="complydoc-architecture-dark",
    paper="#22272e",
    paper2="#2c323b",
    ink="#f5f5f5",
    muted="#bfc0c0",
    soft="#8e98ac",
    rule="rgba(245,245,245,0.14)",
    zone_fill="rgba(245,245,245,0.03)",
    zone_stroke="rgba(245,245,245,0.12)",
    zone_label="rgba(245,245,245,0.45)",
    store_fill="rgba(245,245,245,0.06)",
    input_fill="rgba(191,192,192,0.10)",
    accent="#2fa96a",
    accent_tint="rgba(47,169,106,0.14)",
    accent_stroke="rgba(47,169,106,0.60)",
    accent_wash="rgba(47,169,106,0.05)",
)

SANS = "'Geist', 'Helvetica Neue', Helvetica, Arial, sans-serif"
MONO = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"


def node(t, x, y, w, h, tag, name, sub, kind="step", tag_w=32):
    """One box: paper mask, styled rect, rectangular type tag, name, sublabel."""
    if kind == "focal":
        fill, stroke, tag_col = t["accent_tint"], t["accent"], t["accent"]
    elif kind == "store":
        fill, stroke, tag_col = t["store_fill"], t["muted"], t["muted"]
    elif kind == "input":
        fill, stroke, tag_col = t["input_fill"], t["soft"], t["soft"]
    else:
        fill, stroke, tag_col = (
            ("#ffffff" if t["slug"].endswith("dark") is False else t["paper2"]),
            t["ink"],
            t["ink"],
        )

    cx, cy = x + w / 2, y + h / 2
    return f"""
  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{t["paper"]}"/>
  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="1"/>
  <rect x="{x + 12}" y="{y + 10}" width="{tag_w}" height="12" rx="2" fill="none" stroke="{tag_col}" stroke-opacity="0.40" stroke-width="0.8"/>
  <text x="{x + 12 + tag_w / 2}" y="{y + 19}" fill="{tag_col}" fill-opacity="0.85" font-size="7" font-family="{MONO}" text-anchor="middle" letter-spacing="0.08em">{tag}</text>
  <text x="{cx}" y="{cy + 8}" fill="{t["ink"]}" font-size="12" font-weight="600" font-family="{SANS}" text-anchor="middle">{name}</text>
  <text x="{cx}" y="{cy + 24}" fill="{t["soft"]}" font-size="9" font-family="{MONO}" text-anchor="middle">{sub}</text>"""


def svg(t: dict) -> str:
    slug = t["slug"]
    a = t["accent"]
    stage = "#ffffff" if not t["slug"].endswith("dark") else t["paper2"]
    arrow = f'stroke="{t["muted"]}" stroke-width="1.2" marker-end="url(#{slug}-arrow)"'
    return f"""<svg viewBox="0 0 976 648" role="img" aria-labelledby="{slug}-title {slug}-desc" xmlns="http://www.w3.org/2000/svg">
  <title id="{slug}-title">complydoc architecture</title>
  <desc id="{slug}-desc">Files are read by per-format readers and loader output is taken as it is; both feed four independent analyses (cost, readiness, identifiers, hidden content), configured by YAML, which produce an HTML and JSON report and masked text, all inside a network guard that blocks outbound connections.</desc>
  <defs>
    <marker id="{slug}-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="{t["muted"]}"/>
    </marker>
  </defs>

  <rect width="100%" height="100%" fill="{t["paper"]}"/>

  <!-- Network guard boundary -->
  <rect x="24" y="64" width="928" height="512" rx="8" fill="{t["accent_wash"]}" stroke="{t["accent_stroke"]}" stroke-width="1" stroke-dasharray="4,4"/>
  <rect x="44" y="56" width="96" height="16" rx="2" fill="{t["paper"]}"/>
  <text x="52" y="68" fill="{a}" font-size="8" font-family="{MONO}" letter-spacing="0.14em">NETWORK GUARD</text>

  <!-- Analysis zone -->
  <rect x="448" y="96" width="200" height="368" rx="8" fill="{t["zone_fill"]}" stroke="{t["zone_stroke"]}" stroke-width="0.8"/>
  <rect x="496" y="100" width="104" height="12" rx="2" fill="{t["paper"]}"/>
  <text x="548" y="109" fill="{t["zone_label"]}" font-size="7" font-family="{MONO}" text-anchor="middle" letter-spacing="0.14em">ANALYSIS</text>

  <!-- Arrows, drawn before boxes -->
  <line x1="208" y1="184" x2="256" y2="184" {arrow}/>
  <line x1="208" y1="368" x2="256" y2="368" {arrow}/>
  <line x1="400" y1="184" x2="448" y2="184" {arrow}/>
  <line x1="400" y1="368" x2="448" y2="368" {arrow}/>
  <line x1="648" y1="184" x2="696" y2="184" {arrow}/>
  <line x1="648" y1="368" x2="696" y2="368" {arrow}/>
  <line x1="548" y1="496" x2="548" y2="464" stroke="{t["muted"]}" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#{slug}-arrow)"/>

  <!-- Nodes -->
{node(t, 48, 152, 160, 64, "INPUT", "documents/", "pdf · img · docx · xlsx", "input", 36)}
{node(t, 48, 336, 160, 64, "INPUT", "loader output", "langchain · llamaindex", "input", 36)}
{node(t, 256, 152, 144, 64, "READ", "Ingest", "text layer · ocr", "step", 32)}
{node(t, 256, 336, 144, 64, "LOADER", "Inspect", "one or several loaders", "step", 44)}
{node(t, 460, 128, 176, 64, "01", "Cost", "tokens · prices", "step", 20)}
{node(t, 460, 212, 176, 64, "02", "Readiness", "measured signals", "step", 20)}
{node(t, 460, 296, 176, 64, "03", "Identifiers", "checksums · masked", "step", 20)}
{node(t, 460, 380, 176, 64, "04", "Hidden content", "visibility · instructions", "focal", 20)}
{node(t, 460, 496, 176, 64, "YAML", "Config", "prices · signals · patterns", "store", 32)}
{node(t, 696, 152, 200, 64, "OUT", "Report", "html · json", "store", 28)}
{node(t, 696, 336, 200, 64, "OUT", "Masked text", "chunks · token counts", "store", 28)}

  <!-- Legend -->
  <line x1="24" y1="600" x2="952" y2="600" stroke="{t["rule"]}" stroke-width="0.8"/>
  <text x="24" y="624" fill="{t["muted"]}" font-size="8" font-family="{MONO}" letter-spacing="0.14em">LEGEND</text>

  <rect x="112" y="612" width="16" height="12" rx="2" fill="{t["input_fill"]}" stroke="{t["soft"]}" stroke-width="1"/>
  <text x="136" y="622" fill="{t["soft"]}" font-size="8" font-family="{MONO}">INPUT</text>

  <rect x="276" y="612" width="16" height="12" rx="2" fill="{stage}" stroke="{t["ink"]}" stroke-width="1"/>
  <text x="300" y="622" fill="{t["soft"]}" font-size="8" font-family="{MONO}">STAGE</text>

  <rect x="440" y="612" width="16" height="12" rx="2" fill="{t["accent_tint"]}" stroke="{a}" stroke-width="1"/>
  <text x="464" y="622" fill="{t["soft"]}" font-size="8" font-family="{MONO}">HIDDEN TEXT · INJECTION</text>

  <rect x="644" y="612" width="16" height="12" rx="2" fill="{t["store_fill"]}" stroke="{t["muted"]}" stroke-width="1"/>
  <text x="668" y="622" fill="{t["soft"]}" font-size="8" font-family="{MONO}">CONFIG AND OUTPUT</text>

  <rect x="824" y="612" width="16" height="12" rx="2" fill="{t["accent_wash"]}" stroke="{t["accent_stroke"]}" stroke-width="1" stroke-dasharray="3,3"/>
  <text x="848" y="622" fill="{t["soft"]}" font-size="8" font-family="{MONO}">NO OUTBOUND</text>
</svg>"""


def page(t: dict) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>complydoc — architecture</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body {{ margin:0; background:{t["paper"]}; color:{t["ink"]};
    font-family:'Geist',sans-serif; padding:3rem 2rem; }}
  .wrap {{ max-width:1080px; margin:0 auto; }}
  .eyebrow {{ font-family:'Geist Mono',monospace; font-size:8px; letter-spacing:0.14em;
    text-transform:uppercase; color:{t["soft"]}; margin:0 0 0.5rem; }}
  h1 {{ font-family:'Instrument Serif',serif; font-weight:400; font-size:1.75rem;
    margin:0 0 0.25rem; }}
  .sub {{ color:{t["muted"]}; font-size:0.875rem; margin:0 0 2rem; max-width:64ch; }}
  svg {{ width:100%; height:auto; display:block; }}
</style>
</head>
<body>
<div class="wrap">
  <p class="eyebrow">complydoc</p>
  <h1>Architecture</h1>
  <p class="sub">Files, or the output of another framework's loader, are passed to four
  independent analyses. A run writes an HTML and JSON report; extract_text returns masked text.</p>
  {svg(t)}
</div>
</body>
</html>"""


_FONT_DEFS = (
    "<defs>\n    <style>@import url('https://fonts.googleapis.com/css2?"
    "family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;"
    "family=Geist+Mono:wght@400;500;600&amp;display=swap');</style>\n  "
)


def export_svg(html_path: Path) -> Path:
    """Pull the diagram out as a standalone SVG for the README.

    GitHub renders an <img>-referenced SVG with webfonts blocked, so the font
    stacks in the diagram fall back to system faces. The @import is here for
    browsers that open the file directly.
    """
    import re
    import xml.dom.minidom

    html = html_path.read_text(encoding="utf-8")
    match = re.search(r"<svg\b.*?</svg>", html, re.DOTALL)
    if match is None:
        raise SystemExit(f"no <svg> found in {html_path}")
    svg = match.group(0).replace("<defs>", _FONT_DEFS, 1)
    out = html_path.with_suffix(".svg")
    out.write_text('<?xml version="1.0" encoding="UTF-8"?>\n' + svg + "\n", encoding="utf-8")
    # A bare & would make the file unparseable as XML and it would not render.
    xml.dom.minidom.parse(str(out))
    return out


for theme in (LIGHT, DARK):
    path = OUT / f"{theme['slug']}.html"
    path.write_text(page(theme), encoding="utf-8")
    svg_path = export_svg(path)
    print(f"wrote {path.name} and {svg_path.name}")
