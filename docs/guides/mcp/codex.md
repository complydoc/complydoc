# complydoc in Codex

In `~/.codex/config.toml`:

```toml
[mcp_servers.complydoc]
command = "uvx"
args = ["complydoc", "mcp", "--folder", "/Users/ana/Documents/Contracts"]
startup_timeout_sec = 60
```

Needs [uv](https://docs.astral.sh/uv/). Ask: *Open hidden_clause.pdf and summarise it.*

Keep `startup_timeout_sec`. The first start downloads complydoc, which takes longer than
Codex's default 10 seconds; without the line Codex starts without the tools and shows no
error.

**If it does not work.** Run `codex mcp list` and check that complydoc is enabled.
