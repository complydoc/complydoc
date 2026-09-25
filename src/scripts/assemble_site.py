"""Put the landing page and the documentation together as one GitHub Pages site.

A repository gets one Pages site, so both share it: the landing page at the root,
`https://complydoc.github.io/complydoc/`, and the documentation under `docs/`.

The documentation used to be the root, and its addresses are in READMEs, issues
and search results. Every page it had gets a small page at its old address that
sends the reader to the new one, keeping any `#section` they were linked to.
The documentation's 404 page becomes the site's, since Pages only looks for one
at the root.

    uv run mkdocs build --strict
    npm --prefix landing ci && npm --prefix landing run build
    uv run python src/scripts/assemble_site.py --docs site --landing landing/dist --out _site
"""

from __future__ import annotations

import argparse
import html
import shutil
from pathlib import Path

DOCS_PREFIX = "docs"

REDIRECT = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>The complydoc documentation has moved</title>
    <link rel="canonical" href="{target}">
    <meta name="robots" content="noindex">
    <meta http-equiv="refresh" content="0; url={target}">
    <script>location.replace({target_js} + location.hash);</script>
  </head>
  <body>
    <p>The documentation has moved to <a href="{target}">{target}</a>.</p>
  </body>
</html>
"""


def redirect_page(depth: int, page: str) -> str:
    """A page `depth` folders below the root that sends the reader to `docs/<page>`.

    The target is relative, so the site works under any base path.
    """
    target = "../" * depth + f"{DOCS_PREFIX}/{page}"
    return REDIRECT.format(target=html.escape(target), target_js=repr(target))


def assemble(docs: Path, landing: Path, out: Path) -> int:
    """Write the site to `out` and return how many redirects it holds."""
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(landing, out)
    shutil.copytree(docs, out / DOCS_PREFIX)

    redirects = 0
    for index in sorted(docs.rglob("index.html")):
        folder = index.parent.relative_to(docs)
        if folder == Path("."):
            continue  # the old root is the landing page now
        old = out / folder / "index.html"
        if old.exists():
            raise SystemExit(f"{folder}/ is both a documentation page and part of the landing page")
        old.parent.mkdir(parents=True, exist_ok=True)
        old.write_text(redirect_page(len(folder.parts), f"{folder.as_posix()}/"))
        redirects += 1

    not_found = docs / "404.html"
    if not_found.exists():
        shutil.copy(not_found, out / "404.html")
    return redirects


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--docs", type=Path, required=True, help="the built documentation")
    parser.add_argument("--landing", type=Path, required=True, help="the built landing page")
    parser.add_argument("--out", type=Path, required=True, help="where to write the site")
    args = parser.parse_args()
    count = assemble(args.docs, args.landing, args.out)
    print(f"site in {args.out}: documentation under {DOCS_PREFIX}/, {count} redirects")


if __name__ == "__main__":
    main()
