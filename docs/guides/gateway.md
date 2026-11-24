# The gateway in code

`cd.Gateway` is what stands between your documents and any model, agent or tool. Whatever
passes it comes out with identifiers masked and hidden passages, and text written as an
instruction to a model, taken out. It is the same reading the [MCP server](assistant-mcp.md)
gives an assistant, so a document opened in Claude and one read in your own code come out
the same.

```python title="gateway.py"
--8<-- "examples/gateway.py"
```

| Call | Takes | Gives |
| --- | --- | --- |
| `gateway.read(path)` | a file complydoc reads | a `GatewayResult`, with the text page by page in `pages` |
| `gateway.filter(text)` | any string | a `GatewayResult` |
| `gateway(text)` | any string | the filtered text alone |
| `@gateway.guard` | a function returning text | the same function, its answers filtered |

`result.verdict` says how far the original could be trusted: `ready` (nothing found),
`careful` (identifiers that are not sensitive, or a part left unread), `stop` (hidden text
or a sensitive identifier) or `unread` (nothing could be read, so nothing was checked). The
text returned is cleaned either way. `result.summary()` says what was done, for a person.

`cd.Gateway(block=True)` raises `GatewayBlockedError` instead of returning the text when it
held an instruction to a model or could not be read at all.

When an engine such as Veil is installed, the gateway reads with it, as `complydoc mcp`
does. `engine="none"` reads with complydoc's own configuration, `engine="veil"` with that
one only, and `config_dir=` or `config=` with a configuration of your own. Nothing reaches
the network: the guard is armed for every call.

In Java, complydoc4j has the same gateway: see [Java](java.md).
