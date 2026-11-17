"""complydoc as an MCP server: an assistant opens documents through it, and gets them clean.

`complydoc mcp --folder ./documents` serves three tools over stdio to Claude Desktop,
Copilot or any MCP client. A document read through `open_document` reaches the model with
its identifiers masked and its hidden passages taken out; the file itself never does.
"""

from complydoc.mcp.server import serve

__all__ = ["serve"]
