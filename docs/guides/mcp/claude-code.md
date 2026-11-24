# complydoc in Claude Code

As a plugin (pinned version):

```text
/plugin marketplace add complydoc/complydoc
/plugin install complydoc@complydoc
```

Or as a plain server, with a folder:

```bash
claude mcp add complydoc -- uvx complydoc mcp --folder ~/Documents/Contracts
```

Needs [uv](https://docs.astral.sh/uv/). Ask: *Open hidden_clause.pdf and summarise it.*
Documents also show up with `@`, and the prompts with `/`.

`uvx` may serve a version it cached earlier. To get the newest, use `uvx complydoc@latest mcp`.

**If it does not work.** Run `/mcp` and check that complydoc is connected.
