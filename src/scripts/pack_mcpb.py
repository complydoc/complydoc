"""Pack complydoc's Claude Desktop extension from `mcpb/`.

    python src/scripts/pack_mcpb.py dist [--ref BRANCH]

`--ref` builds a test copy that installs complydoc from a branch instead of the release.

There is one extension, `complydoc.mcpb`: identifiers found by pattern, hidden text, and
names of people and companies in the European languages. It installs the
`multilingual-names` extra and fetches the model (about 700 MB) once, the first time it
starts; until then every reading says names are not masked yet.
"""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "mcpb"
FILES = ("manifest.json", "pyproject.toml", "icon.png", "src/server.py")


def pack(out: Path, *, ref: str | None = None) -> Path:
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    pyproject = (SOURCE / "pyproject.toml").read_text(encoding="utf-8")
    released = f'"complydoc=={manifest["version"]}"'
    if ref is not None:
        # A test copy, installing complydoc from a branch rather than the release.
        branch = f'"complydoc @ git+https://github.com/complydoc/complydoc@{ref}"'
        pyproject = pyproject.replace(released, branch)
    target = out / "complydoc.mcpb"
    manifest["description"] = (
        "Open your documents in Claude with personal details and names masked, and hidden "
        "instructions taken out."
    )
    manifest["long_description"] += (
        "\n\nNames of people and companies are masked too, in English, Portuguese, German, "
        "Spanish, French, Italian and other European languages. The model that finds them, "
        "about 700 MB, is downloaded once the first time the extension starts; until then "
        "the assistant is told that names are not masked yet."
    )
    args = manifest["server"]["mcp_config"]["args"]
    # Before --folder, whose folders the client expands into several arguments.
    args.insert(args.index("--folder"), "--fetch-name-model")
    pyproject = pyproject.replace('"complydoc @ git+', '"complydoc[multilingual-names] @ git+')
    pyproject = pyproject.replace('"complydoc==', '"complydoc[multilingual-names]==')
    out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in FILES:
            if name == "manifest.json":
                archive.writestr(name, json.dumps(manifest, indent=2) + "\n")
            elif name == "pyproject.toml":
                archive.writestr(name, pyproject)
            else:
                archive.write(SOURCE / name, name)
    return target


if __name__ == "__main__":
    arguments = sys.argv[1:]
    ref = None
    if "--ref" in arguments:
        at = arguments.index("--ref")
        ref = arguments[at + 1]
        del arguments[at : at + 2]
    out = Path(arguments[0] if arguments else "dist")
    print(pack(out, ref=ref))
