# Langfuse and Phoenix

Langfuse and Arize Phoenix record the model call: the prompt, the generation, the
eval. complydoc records the ingestion before that call: which loader read the file,
what the splitter passed on, and which identifiers were in the text sent to an
embedding API. A scan that loaded no text is absent from an LLM trace.
A generation is absent from a complydoc report. They are records of different
parts of the same request.

complydoc does not send its report to either of them. There is no exporter. The
report is a JSON file, opened with `complydoc ui`. The span that covers the model
call carries the pipeline's name and that file's path, which is enough to find one
from the other.

## What each one sees

| | complydoc | Langfuse or Phoenix |
| --- | --- | --- |
| When | Loading, cleaning, splitting, embedding, storing | The model call, and the evals around it |
| Where it lives | A JSON file on this machine, or a bucket named as `out` | Their backend |
| Network | None of its own. Inside [`cd.observe`](observe-a-pipeline.md), the pipeline's own connections go through and are recorded | The client has to reach the backend |

## Record the ingestion, then call the model

```python title="langfuse_phoenix.py"
--8<-- "examples/langfuse_phoenix.py"
```

`run.name` is the pipeline. `complydoc ui` groups runs under that name.
`run.location` is where the report went: a path on this machine, or an `s3://`
address when `out` is a bucket. `run.path` is the local `Path` when the file is
here, and `None` after an upload. The link in the example is the name and
`run.location`.

`cd.expect(run.report).no_identifiers_sent(severity="high")` is the check a
[policy file](policy.md) writes as `no_identifiers_sent`. It fails when a step sent
text holding an identifier at or above that severity to a host. A report with no
pipeline raises `ValueError`: it cannot say what was sent. From a shell, on the
file the run wrote:

```yaml title="policy.yaml"
version: 1
rules:
  no_identifiers_sent:
    severity: high
  only_hosts:
    hosts: [api.openai.com]
```

```bash
complydoc check --report .complydoc/contracts-ingest-20261015-170201.json --policy policy.yaml
```

`only_hosts` fails when a step reached a host that is not in the list. Leave
Langfuse and Phoenix off it. The documents go to the hosts you named, such as the
embedding API.

`attach_langfuse` and `attach_phoenix` are not called by the script. Each opens the
span after the block has closed, which is where the model call goes. The string
`"the model's reply"` stands in for that call's output so the function is whole;
replace it with the reply you actually got.

## Langfuse

```bash
pip install langfuse
```

The client reads `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and
`LANGFUSE_BASE_URL`. The EU cloud is `https://cloud.langfuse.com`. A self-hosted
server uses its own URL. `LANGFUSE_HOST` is the old name of that URL and still
works.

```python
span.update(metadata=link)
```

sets `complydoc_run` and `complydoc_report` on the span the function opened: the
name and the path. The document and the report stay where they were written.
`langfuse.flush()`
is what gets the span out of a short script. A long-running process exports on its
own.

An integration that opens its own observations inside that span (Langfuse's OpenAI
wrapper, or a LangChain callback) does not inherit `span.update`. Wrap those calls
in `propagate_attributes(metadata=link)` from `langfuse` so the keys are copied
onto them. Each propagated value is JSON-encoded first, a string included, and
dropped with a warning when that encoding is longer than 200 characters. A path
longer than 198 characters is dropped. `span.update` writes the metadata onto the
span without that drop. Langfuse's observations API still returns a metadata value
cut at 200 characters unless the request asks for the full value, so a very long
path can come back short. The pipeline name is short, and it is the name
`complydoc ui` groups runs under.

In the Langfuse UI, filter on `complydoc_run`. The report is the file
`complydoc_report` names. `complydoc ui` on that file, or on the folder that holds
it, opens the run.

## Phoenix

```bash
pip install arize-phoenix-otel
```

A Phoenix on this machine is `phoenix serve`, from the `arize-phoenix` package
(`uvx arize-phoenix serve` does the same). It serves its UI and OTLP HTTP on port
6006, and OTLP gRPC on port 4317. With `PHOENIX_COLLECTOR_ENDPOINT` unset,
`register()` uses gRPC on `http://localhost:4317`. Set the variable for any other
server. A server that requires authentication also needs `PHOENIX_API_KEY`. A local
`phoenix serve` does not.

On the span the function opens:

```python
span.set_attribute("complydoc.run", link["complydoc_run"])
span.set_attribute("complydoc.report", link["complydoc_report"])
```

Both values are strings. `provider.force_flush()` pushes them before a short
script exits. `batch=False` is the Python `register()` default, so spans are not
held for a batch.

When an OpenInference instrumentor creates the span, you do not hold it.
`using_metadata` from `phoenix.otel` puts the dict on the context as one JSON
attribute, and the instrumentor copies it onto the spans it opens:

```python
from phoenix.otel import register, using_metadata

register(project_name="contracts", auto_instrument=True)

with using_metadata(link):
    answer = client.chat.completions.create(...)
```

`auto_instrument=True` turns on the instrumentors that are installed. It does not
install them. A span opened with `start_as_current_span`, as in the example, does
not read `using_metadata`; set the attributes on it. `using_metadata` is exported
from `phoenix.otel` in `arize-phoenix-otel` 0.16 and later. Before that, import it
from `openinference.instrumentation`.

## The network

complydoc blocks outbound connections, DNS included, while its own work runs. The
guard allows Unix sockets and refuses everything else, so `127.0.0.1` is not
exempt. Phoenix on this machine is still a connection, and it is refused while the
guard is armed.

[`cd.observe`](observe-a-pipeline.md) lets connections through for the length of
the block. A connection inside a step is recorded on that step. `only_hosts`
fails when that host is not in the list, and `no_identifiers_sent` treats every
identifier on the step as sent to every host the step reached. A tracing export
from inside a step that also holds identifiers is reported as those identifiers
having been sent to Langfuse or Phoenix. A connection in the block but outside
any step is listed on the trace as outside a stage. `only_hosts` does not see
it. That open network is what makes an embedding API possible. It is also why
the export belongs after the block, not in it.

Make the model call, and the export, after the block. The Python API puts the
guard back when the block ends, and a normal process can reach Langfuse or Phoenix
again. The commands that read documents arm the guard for the whole process, so
`complydoc check --report` belongs in its own step, not in the process that talks
to those backends.

The span carries the name and the path. That is enough to open the report, which
masks identifiers unless that run passed `reveal=True`.

## Limits

The complydoc viewer shows the report. Langfuse and Phoenix show their own traces.
Nothing embeds one in the other. There is no shared trace id: a complydoc run is
not an OpenTelemetry trace. The link is the name and the path.
