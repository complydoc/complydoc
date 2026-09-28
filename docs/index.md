---
hide:
  - navigation
---

<div class="cd-hero" markdown>
<p class="cd-eyebrow">observability for AI ingestion · open source</p>

# The observability layer for AI ingestion pipelines

<p class="cd-lead">Know your documents before they reach an LLM. complydoc traces every step between your documents and your vector store (loading, cleaning, splitting, embedding) and shows what each one cost, how long it took, what it extracted, and which identifiers it let through. It runs on your machine.</p>

[Observe a pipeline](guides/observe-a-pipeline.md){ .md-button .md-button--primary }
[Audit a folder](guides/audit-a-folder.md){ .md-button }
</div>

## Quickstart

```bash
uv tool install complydoc
```

OCR and name detection are optional extras. `complydoc doctor` reports which are
installed and what their absence leaves out of a run.

=== "Trace a pipeline"

    ```python
    import complydoc as cd

    with cd.observe("contracts-ingest"):
        documents = PyMuPDF4LLMLoader("contract.pdf").load()
        chunks = splitter.split_documents(documents)
        vectors = embeddings.embed_documents([c.page_content for c in chunks])
    ```

    Each loader, splitter and embedding call becomes a step of a trace, written to
    `.complydoc`. Open it with `complydoc ui`.

=== "Audit a folder"

    ```bash
    complydoc audit ~/contracts
    complydoc ui
    ```

    Cost, extraction readiness, identifiers and hidden text, document by document.

=== "Try it on the samples"

    ```bash
    complydoc demo
    ```

    A full report on the documents bundled with complydoc, opened in the viewer.

## What you can do

<div class="grid cards" markdown>

-   :material-graph-outline:{ .lg } __Trace a pipeline__

    Every call a LangChain or LlamaIndex pipeline makes, with its settings, time,
    tokens, cost, and the identifiers it passed on.

    [Observing a pipeline](guides/observe-a-pipeline.md)

-   :material-file-compare:{ .lg } __Compare loaders__

    Several loaders on the same files, one decision per file type, and a diff of
    each document they read differently.

    [Comparing loaders](guides/compare-loaders.md)

-   :material-scissors-cutting:{ .lg } __Choose a chunk size__

    Six splitters side by side, the chunks drawn over each document, and the
    sentences and tables they cut.

    [Inspecting chunks](guides/inspect-chunks.md)

-   :material-shield-search:{ .lg } __Find what should not leave__

    Personal and financial identifiers, and instructions hidden for a model,
    masked in the report and in your pipeline.

    [Identifiers](reference/identifiers.md)

-   :material-cash-multiple:{ .lg } __Price the reading__

    Text and vision tokens for every model, and which pages need OCR or a vision
    model at all.

    [Page routing](guides/routing.md)

-   :material-source-pull:{ .lg } __Hold it in CI__

    Rules in YAML: no identifier sent to a hosted model, only the hosts you allow,
    no regression from a baseline.

    [Policy files](guides/policy.md)

</div>

## The viewer and the report

`complydoc ui` opens every report and pipeline run in a folder in your browser, served
from your machine. A trace shows the calls in a tree with each one's input and output;
a document shows every page with the chunks drawn over its text and each finding in
place; two readers of a document show as a diff. See [The report viewer](guides/viewer.md).

The report itself is JSON, carrying `schema_version`, currently 17. Identifiers are
masked everywhere in it, including the page text, unless the run used `--reveal`;
`--page-images` adds a picture of each page, which shows them.

## Network access

The process makes no outbound connections of its own. Before any file is opened,
`socket.socket.connect`, `connect_ex`, `socket.create_connection` and
`socket.getaddrinfo` are replaced with functions that raise. `AF_UNIX` sockets
are permitted. Each report records whether the guard was active. Model prices
are vendored as data files.

A pipeline observed with `cd.observe` may need the network, for an embedding API
say: inside the block, its connections go through and each is recorded against the
step that made it. Two things a caller can ask for send data out themselves. An
instruction classifier backed by a hosted service sends the passages it judges; the
report names the hosts in `run.content_sent_to`, states it as an important
limitation, and `expect(report).no_network()` fails.
[`complydoc assist`](guides/assist.md) sends a finished report to a hosted chat
model. Both need `allow_network=True` and neither runs as part of an audit. See
[Network isolation](explanation/offline.md).

## Limits

- **Masking is best effort.** Categories with a checksum are confirmed; names and
  organisations come from a statistical model and are missed at some rate.
- **Unmeasured signals are reported as unmeasured** and excluded from scores.
- **Table fidelity describes the extractor that ran.** Only an extractor that reads table
  structure detects a table at all, so the measurement is of that reader's own text.
- **Hidden-content checks** cover PDF text layers and the markup of Word, Excel,
  PowerPoint, HTML, Markdown and email files, not text inside images.

A hosted companion for teams, complydoc Cloud, is planned.
[Say if your team would use it](https://github.com/complydoc/complydoc/discussions).
