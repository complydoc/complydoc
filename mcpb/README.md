# complydoc for Claude Desktop

The files of complydoc's Claude Desktop extension. `make mcpb` packs them into
`dist/complydoc.mcpb`; opening that file in Claude Desktop installs complydoc, asks for the
documents folder, and gives the assistant `list_documents`, `check_document` and
`open_document`.

The extension uses the `uv` server type: Claude Desktop installs Python and complydoc from
`pyproject.toml` on first use, so the person installing it needs nothing else. Names of
people and companies are not masked by this light version; see
[Name detection models](../docs/guides/name-detection-models.md).

On a release, set `version` in `manifest.json` and `pyproject.toml`, and point the
dependency at the released `complydoc` instead of the branch.
