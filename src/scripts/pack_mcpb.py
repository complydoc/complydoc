"""Pack complydoc's Claude Desktop extension, in its two editions, from `mcpb/`.

    python src/scripts/pack_mcpb.py dist [--ref BRANCH]

`--ref` builds a test copy that installs complydoc from a branch instead of main.

- `complydoc.mcpb`, the light edition: identifiers found by pattern and hidden text.
- `complydoc-names.mcpb`, which also masks names of people and companies in the European
  languages: it installs the `multilingual-names` extra and fetches the model (about
  700 MB) once, the first time it starts.
"""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "mcpb"
FILES = ("manifest.json", "pyproject.toml", "icon.png", "src/server.py")


def pack(out: Path, *, names: bool, ref: str = "main") -> Path:
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    pyproject = (SOURCE / "pyproject.toml").read_text(encoding="utf-8")
    pyproject = pyproject.replace("complydoc/complydoc@main", f"complydoc/complydoc@{ref}")
    target = out / ("complydoc-names.mcpb" if names else "complydoc.mcpb")
    if names:
        manifest["name"] = "complydoc-names"
        manifest["display_name"] = "complydoc (with names)"
        manifest["description"] = (
            "Open your documents in Claude with personal details and names masked, and hidden "
            "instructions taken out."
        )
        manifest["long_description"] += (
            "\n\nThis edition also masks names of people and companies, in English, Portuguese, "
            "German, Spanish, French, Italian and other European languages. The model that "
            "finds them, about 700 MB, is downloaded once the first time it starts; until then "
            "the assistant is told that names are not masked yet."
        )
        args = manifest["server"]["mcp_config"]["args"]
        # Before --folder, whose folders the client expands into several arguments.
        args.insert(args.index("--folder"), "--fetch-name-model")
        pyproject = pyproject.replace('"complydoc @ git+', '"complydoc[multilingual-names] @ git+')
        pyproject = pyproject.replace(
            'name = "complydoc-claude-extension"', 'name = "complydoc-claude-extension-names"'
        )
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
    ref = "main"
    if "--ref" in arguments:
        at = arguments.index("--ref")
        ref = arguments[at + 1]
        del arguments[at : at + 2]
    out = Path(arguments[0] if arguments else "dist")
    for edition in (False, True):
        print(pack(out, names=edition, ref=ref))
