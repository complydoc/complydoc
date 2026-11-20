# complydoc in VS Code (GitHub Copilot)

Click [Install in VS Code](https://insiders.vscode.dev/redirect/mcp/install?name=complydoc&config=%7B%22name%22%3A%22complydoc%22%2C%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22complydoc%22%2C%22mcp%22%5D%7D), or put this in `.vscode/mcp.json`:

```json
{
  "servers": {
    "complydoc": {
      "command": "uvx",
      "args": ["complydoc", "mcp", "--folder", "${workspaceFolder}/documents"]
    }
  }
}
```

Needs [uv](https://docs.astral.sh/uv/) and a GitHub account with Copilot (Free works).
Open Copilot Chat in agent mode and ask: *Open hidden_clause.pdf and summarise it.*

In the chat panel, use a **Local** session. A **Copilot CLI** session inside VS Code refuses
servers from `.vscode/mcp.json` ("blocked by the managed policy") before complydoc starts.

**If it does not work.** Run **MCP: List Servers** and check that complydoc is running.
