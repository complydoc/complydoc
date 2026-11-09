# Observing a pipeline

`cd.observe` records an ingestion pipeline as it runs. Wrap the code that loads,
cleans, splits and embeds your documents in the block, and each call becomes a
step of a trace: what went in and came out, the component's settings, the time it
took, the identifiers in what it passed on, and the hosts it sent text to.

```python title="observe_a_pipeline.py"
--8<-- "examples/observe_a_pipeline.py"
```

Nothing in your pipeline changes. Outside the block, nothing is touched.

## What is observed

| Library | Observed |
| --- | --- |
| LangChain | document loaders (`load`, `lazy_load`, `aload`, `alazy_load`), document transformers, text splitters (`split_documents`, `create_documents`), embedding models (`embed_documents`, `aembed_documents`) and vector stores (`add_documents`, `add_texts` and their async forms) |
| LlamaIndex | readers (`load_data`, `lazy_load_data` and their async forms), node parsers (`get_nodes_from_documents`), embedding models (`get_text_embedding_batch`), vector stores (`add`, `async_add`), and any other transform component an `IngestionPipeline` runs |
| PDF libraries | a file read with pypdf's `PdfReader` or PyMuPDF's `Document` in your own code, page by page |
| Haystack | converters (`PyPDFToDocument` and every other `…ToDocument` or converter), splitters, `DocumentCleaner`, document embedders and `DocumentWriter`, run by a `Pipeline` or alone, through `run` or `run_async` |
| Docling | the converter (`DocumentConverter.convert`, `convert_all`) and its chunkers (`chunk`), called directly or through Docling's LangChain loader |
| Unstructured | the partitioners (`partition`, `partition_pdf` and every other `partition_<format>`) and the chunkers (`chunk_by_title`, `chunk_elements`) |
| Marker | its converters, such as `PdfConverter`, called with a file |
| Chonkie | its chunkers (`chunk`, `chunk_batch`, `chunk_document`, a chunker called itself, and the async forms) |
| Embedding SDKs | OpenAI's `client.embeddings.create`, Cohere's `embed` (v1 and v2 clients), Voyage's `embed`, Mistral's `embeddings.create`, and Gemini's `models.embed_content`, sync and async, priced by the model the call names; sentence-transformers' `encode` and `encode_document`, run on your machine |
| Vector databases | Qdrant's `upsert`, `upload_points` and `upload_collection`; a Chroma collection's `add` and `upsert`; a Pinecone index's `upsert` and `upsert_records`, over HTTP, async or gRPC |
| complydoc | its pipeline steps, such as `MaskIdentifiers` and `StripPathMetadata` |
| Your code | any function marked `@cd.stage` |

A LlamaIndex embedding model is sent each node's text together with its metadata, so
its step is recorded where the batch is embedded, and scanned as sent.

Many pipelines read their files with a few lines of their own: LangChain's semantic search
tutorial reads PDF pages with pypdf. Each file opened and read that way is a load step,
timed from opening it, holding the text of each page with the file and page named. A
library a loader calls, as `PyPDFLoader` calls pypdf, is part of the loader's step. Where
documents come from code complydoc does not see at all, the first step given them is
checked for what a loader is checked for (see Warnings).

A vector store's step is what it was given, since that is what stays in the index:
its texts, the metadata kept with them and the identifiers in both. A store that
embeds what it is given holds the embedding call as a step inside it.

A database's own client is a store step too, called directly or by a framework's store.
Each record is read as a document under the ID it is stored by: its text is the field a
framework keeps it in (`page_content`, `text`, `document`, `content` or `chunk_text`), and
the rest of the payload is its metadata, LangChain's nested `metadata` field included.
Called by LangChain's `Chroma` or LlamaIndex's `QdrantVectorStore`, the client's call is a
step inside the store's. A batch given as an iterator, as `upload_points` takes one, is
read by the database and not by complydoc, so its step holds no documents.

A library is observed wherever it is imported, before the block or inside it, as a
function that imports what it uses does. A call made
inside another observed call is part of it: `load` calling `lazy_load` is one step.

```python
@cd.stage("dedupe")
def dedupe(documents):
    ...
```

The first argument of a marked function, when it is a list, is what the step was
given, and a list it returns is what it passed on.

Docling's converter returns a result holding the whole document; its step is read as one
document a page, named by the file, as LangChain's PDF loaders give them. A chunk keeps
Docling's provenance, so its page is known. What your code receives is Docling's own.

Unstructured's partitioners and chunkers are plain functions your code imports by name,
usually before the block opens. Each is replaced where Unstructured defines it and in your
own modules that hold it, notebooks included, and put back when the block ends. Its
elements are read as documents, metadata included, and its keyword arguments, such as
`strategy` or `max_characters`, are the step's settings. `partition` calling
`partition_pdf` is one step.

A name imported inside a function before the block opens is out of reach. There, mark the
function that calls it:

```python
@cd.stage("partition", kind="load")
def read(path):
    from unstructured.partition.auto import partition
    return partition(filename=path)
```

Unstructured used through LangChain's or LlamaIndex's loader is observed as that loader.

Marker returns a file's Markdown, which does not say where it came from: its step names
the file it was called with, and Markdown asked to be paginated is read as a document a
page. A Haystack document is read by its `content` and `meta`, and a writer's step names
each document by its ID.

## When the block ends

- The documents loaded in the block are audited as `cd.inspect_documents` audits a
  loader's output, so the viewer's Security, Documents and Cost pages work on the run.
- Each splitter's chunks are inspected as `cd.inspect_chunks` inspects them, and
  drawn over the documents in the viewer.
- Every step's output is scanned for identifiers, so one value can be followed from
  the loader to what the embedding model was sent.
- Every step records what it did with each document, so a document can be followed
  from its loader to where it was sent, or to the step it went no further than.
- Each step is checked for the failures that raise nothing (below).
- The report is written to `.complydoc/<name>-<time>.json`. Each run is its own file;
  `complydoc ui` groups runs by the pipeline's name.

`run.report` is the report, `run.path` where it was written, and `run.summary()` a
line per step. Scanning happens after the pipeline has run, so the step timings are
the pipeline's own; the time observing took is reported apart.

## Warnings

A pipeline's commonest failures raise no error. Each is a warning on the step whose
output shows it, naming the documents it concerns:

| Step | Warns of |
| --- | --- |
| Loader | A document that loaded no text, such as a scan without OCR; pages with no text; text garbled by replacement characters or words run together |
| Splitter | Chunks under 20 tokens; chunks repeating an earlier one |
| Embedding model | Empty texts; texts over the model's token limit, for the models whose limit complydoc knows |
| Vector store | Empty texts stored |

`run.summary()` ends each step's line with its warnings.

## The network

The pipeline may need the network, for an embedding API say. Inside the block,
connections go through and each one is recorded against the step that made it. The
report names the hosts each step reached, and its first limitation says what the
step that reached one sent there: how many texts, and the identifiers they held.
Text is never sent anywhere by complydoc itself, and vectors are not kept.

## In CI

Two rules hold a recorded pipeline to what it may send, in a
[policy file](policy.md) or in a test:

```yaml title="policy.yaml"
rules:
  no_identifiers_sent:
    severity: high
  only_hosts:
    hosts: [my-resource.openai.azure.com]
```

```bash
complydoc check --report .complydoc/contracts-ingest-20260927-101500.json --policy policy.yaml
```

```python
cd.expect(run.report).no_identifiers_sent(severity="high").only_hosts(["my-resource.openai.azure.com"])
```

## How much is scanned

| `scan` | Scans | For |
| --- | --- | --- |
| `"patterns"` (the default) | Identifier patterns and hidden text at every step; the name model on the documents loaded and on the last step | Everyday use |
| `"full"` | Everything at every step | Tracking down where a value leaks |
| `"off"` | Counts, settings, timings and connections only | Production, where only the shape is wanted |

A step read by patterns alone cannot see a name only the name model finds, so the
viewer shows such a name as not looked for at that step, never as removed by it.
Embedding calls and vector stores are always read with the name model where it is
installed: what they are given is what leaves, or stays.

Without a name model, names cannot be found, so they are neither counted nor masked,
in the report or in the trace's previews of each step. The trace says so: the steps
are marked as read by patterns alone, the report's limitations and `run.summary()`
name what was not looked for and how to install it, and the viewer heads the trace
with it. See [Name detection models](name-detection-models.md).

## If something fails

What the pipeline raises is raised as usual, after the trace is written with the
step that raised it and its traceback. The traceback's file paths are shortened, to
the package or to the folder the run read, and identifiers in its message masked. If complydoc fails to record the pipeline, the pipeline's
result stands: complydoc warns, and `run.error` says why.

## Beside an LLM trace

Langfuse and Phoenix record the model call that follows this pipeline. complydoc
does not export to them. [Langfuse and Phoenix](langfuse-phoenix.md) keeps this
report and puts its path on the span that covers the call.
