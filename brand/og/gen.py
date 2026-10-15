"""Draw the card a shared link shows.

The light card, 1200 by 630, is the one the site serves. Running this writes it
to landing/public/og.png, which the assembled site publishes at /og.png.
It needs Chrome. The other sizes are written beside this file.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[1] / "landing" / "public" / "og.png"

MARK = (
    "M35 84A30 30 0 0 1 9 58A30 30 0 0 1 35 84Z"
    "M43 84A72 72 0 0 1 93 20A72 72 0 0 1 43 84Z"
    "M11 34a13 13 0 1 0 26 0a13 13 0 1 0 -26 0Z"
)
THEMES = {
    "dark": dict(bg="#000000", ink="#e9e9e7", g="#4cc38a", mu="#9aa0a6", fa="#71767b", br="#222427"),
    "light": dict(bg="#fbfbfa", ink="#111111", g="#1a7f4b", mu="#666666", fa="#999999", br="#e8e8e6"),
}
SANS = "Geist, 'Helvetica Neue', Helvetica, Arial, sans-serif"
MONO = "'Geist Mono', ui-monospace, Menlo, monospace"


def svg(theme: str, width: int, height: int) -> str:
    c = THEMES[theme]
    margin = 88
    scale = width / 1280

    def y(value: float) -> float:
        return value * height / 640

    mark = 0.6875 * scale  # the mark is 44px tall on the 1280-wide card
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-label="complydoc: Know your documents before they reach an LLM.">
  <rect width="{width}" height="{height}" fill="{c['bg']}"/>
  <g transform="translate({margin} {y(84)})"><path fill="{c['g']}" fill-rule="evenodd" transform="scale({mark * 0.9:.4f}) translate(-9 -20)" d="{MARK}"/>
  <text x="{70 * scale:.1f}" y="{40 * scale:.1f}" fill="{c['ink']}" font-size="{44 * scale:.1f}" font-weight="600" font-family="{SANS}" letter-spacing="-1">complydoc</text></g>
  <text x="{margin}" y="{y(300)}" fill="{c['ink']}" font-size="{76 * scale:.1f}" font-weight="600" font-family="{SANS}" letter-spacing="-2.5"><tspan x="{margin}">Know your documents</tspan><tspan x="{margin}" dy="{88 * scale:.1f}">before they reach an LLM.</tspan></text>
  <text x="{margin}" y="{y(458)}" fill="{c['mu']}" font-size="{32 * scale:.1f}" font-weight="400" font-family="{SANS}" letter-spacing="-0.3">Observability for the pipeline that feeds your model.</text>
  <line x1="{margin}" y1="{y(530)}" x2="{width - margin}" y2="{y(530)}" stroke="{c['br']}" stroke-width="1.5"/>
  <text x="{margin}" y="{y(576)}" font-size="{22 * scale:.1f}" font-family="{MONO}" fill="{c['mu']}">load <tspan fill="{c['fa']}">→</tspan> split <tspan fill="{c['fa']}">→</tspan> embed</text>
  <text x="{width - margin}" y="{y(576)}" text-anchor="end" font-size="{22 * scale:.1f}" font-family="{MONO}" fill="{c['fa']}">open source · runs on your machine · MIT</text>
</svg>
'''


def render(name: str, width: int, height: int) -> None:
    source = HERE / f"{name}.svg"
    out = HERE / f"{name}.png"
    page = Path(f"/tmp/{name}.html")
    page.write_text(f'<html><body style="margin:0">{source.read_text()}</body></html>')
    subprocess.run(
        [
            "google-chrome",
            "--headless=new",
            "--no-sandbox",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--window-size={width},{height}",
            f"--screenshot={out}",
            "file://" + page.as_posix(),
        ],
        capture_output=True,
    )
    if name == "og":
        shutil.copyfile(out, PUBLIC)


def main() -> None:
    cards = [
        ("dark", 1280, 640, "og-dark"),
        ("light", 1280, 640, "og-light"),
        ("dark", 1200, 630, "og-dark-1200"),
        ("light", 1200, 630, "og"),
    ]
    for theme, width, height, name in cards:
        (HERE / f"{name}.svg").write_text(svg(theme, width, height))
        render(name, width, height)


if __name__ == "__main__":
    main()
