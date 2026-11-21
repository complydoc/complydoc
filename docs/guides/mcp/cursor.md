# complydoc in Cursor

Click [Install in Cursor](https://cursor.com/en/install-mcp?name=complydoc&config=eyJjb21tYW5kIjoidXZ4IiwiYXJncyI6WyJjb21wbHlkb2MiLCJtY3AiXX0=), or put this in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "complydoc": {
      "command": "uvx",
      "args": ["complydoc", "mcp", "--folder", "/Users/ana/Documents/Contracts"]
    }
  }
}
```

Needs [uv](https://docs.astral.sh/uv/). Without `--folder`, ask the assistant to choose one.
Ask: *Open hidden_clause.pdf and summarise it.*

**If it does not work.** Cursor does not see your shell's `PATH`: give the full path that
`which uvx` prints as `command`.
