# complydoc for Claude Desktop

The files of complydoc's Claude Desktop extension. `make mcpb` packs them into two
editions: `dist/complydoc.mcpb`, which masks identifiers found by pattern, and
`dist/complydoc-names.mcpb`, which also masks names of people and companies. Opening either
in Claude Desktop installs complydoc, asks for the documents folders, and gives the
assistant its tools. `src/scripts/pack_mcpb.py` writes the names edition from these files:
its own name, the `multilingual-names` extra and `--fetch-name-model`, which downloads the
name model once, outside the session's network guard. `--ref <branch>` packs a test copy
that installs complydoc from a branch.

The extension uses the `uv` server type: Claude Desktop installs Python and complydoc from
`pyproject.toml` on first use, so the person installing it needs nothing else. See
[Name detection models](../docs/guides/name-detection-models.md) for the model the names
edition uses.

On a release, set `version` in `manifest.json` and `pyproject.toml`, and the `complydoc==`
dependency in `pyproject.toml`, to the release.
