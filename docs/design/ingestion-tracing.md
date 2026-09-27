# Design note: tracing an ingestion pipeline

Status: agreed 27 September 2026; the questions at the end are settled. Being built.

## What and why

complydoc checks documents before they reach a model. Today it does that on a
folder (`audit`), on a loader's output (`inspect_documents`), on several loaders
(`compare_loaders`) and on a splitter's chunks (`inspect_chunks`), each called on
its own. A real ingestion pipeline is those steps chained in someone's code:
load, clean, split, embed. Tracing records that chain as it runs, so one report
shows what every stage did to the documents.

The gap it fills: LLM tracers (LangSmith, Phoenix, MLflow) trace chains, models
and retrievers. MLflow's LangChain autolog is built on LangChain's callbacks, and
document loaders and text splitters do not emit them, so the first step, the
one that decides what the model will ever see, goes untraced. complydoc traces
only that step, and treats the documents as the thing observed. Retrieval is out
of scope.

## What a trace answers

- Which stage introduced or removed an identifier. The IBAN was in 1 document
  after loading, 0 after masking, and in 3 chunks after splitting.
- Which stage lost text: characters and pages in and out of each stage, and
  expected facts that were whole before the splitter and split after it.
- What each stage was configured with: the loader's mode, the splitter's
  `chunk_size`, `chunk_overlap` and separators, the embedding model.
- What left the machine, and to where. The embedding stage sent 412 chunks,
  holding 9 identifiers, to one host. This is the compliance headline.
- How long each stage took, and what it cost where a price is known.

## Using it

Two forms, sharing one engine.

```python
import complydoc as cd

with cd.observe("contracts-ingest") as trace:        # writes .complydoc/<name>-<time>.json on exit
    docs = PyPDFLoader("contract.pdf").load()          # captured: a load stage
    docs = cd.MaskIdentifiers().transform(docs)        # captured: complydoc's own step
    chunks = splitter.split_documents(docs)            # captured: a split stage
    vectors = embeddings.embed_documents([c.page_content for c in chunks])  # captured: embed

print(trace.summary())
```

- `cd.observe(name)` is a context manager. Inside the block, supported library
  classes are observed; outside it, nothing is touched. This is the documented form.
- `@cd.stage("clean")` marks a function of the user's own as a stage, for
  steps no library provides, such as a regex scrub or a dedupe.
- `cd.autolog()`, which observes everywhere in the process until
  `cd.autolog(disable=True)`, comes later, once the context-manager form has
  proven where a trace starts and ends.

## How stages are captured

| Library | Loading | Transforming, splitting | Embedding |
| --- | --- | --- | --- |
| LangChain | patch `BaseLoader.load`, `lazy_load`, `alazy_load` | patch `BaseDocumentTransformer.transform_documents` and `TextSplitter.split_documents` | patch `Embeddings.embed_documents`, `aembed_documents` |
| LlamaIndex | patch `BaseReader.load_data` | a span handler on the instrumentation dispatcher, plus `NodeParser.get_nodes_from_documents` and `IngestionPipeline.run` | span handler, or `BaseEmbedding.get_text_embedding_batch` |
| complydoc | its steps (`MaskIdentifiers` and others) report themselves | | |
| Your code | `@cd.stage` | `@cd.stage` | `@cd.stage` |

Rules for the patches:

- Installed on entering the block and removed on leaving it, even on error.
- A call made inside another observed call is not counted twice. For example,
  `split_documents` calls `create_documents`, and `load` calls `lazy_load`.
- A failure inside complydoc's observation is recorded in the trace and never
  raised into the user's pipeline. A trace that cannot record something says so.
- Tested against pinned version ranges. Outside them, observation is skipped for
  that class and the trace says which.

## What each stage records

| Field | Contents |
| --- | --- |
| `kind` | `load`, `transform`, `split`, `embed`, `custom` |
| `component` | Class and module, tagged as loader comparisons already tag them (LangChain, pypdf, and so on) |
| `parameters` | The component's public settings: a splitter's `chunk_size`, `chunk_overlap`, `separators`; a loader's `mode`; an embedding model's name. Read from attributes, never from arguments holding text. |
| `inputs`, `outputs` | Documents, pages, chunks, characters and tokens in and out |
| `identifiers` | By fingerprint and masked value, which were in and which out, so a value can be followed across stages |
| `hidden` | Hidden or instruction-like passages in the output |
| `metadata` | Metadata keys added, and any holding absolute paths |
| `network` | Hosts contacted during the stage, from the guard in record mode, and what was sent: counts and identifiers, never text |
| `seconds` | Wall time of the stage, and complydoc's own overhead separately |
| `errors` | What the stage raised, if it did |

Stage outputs are also kept in the forms complydoc already reports:

- the load stage's documents as report entries, so Security, Documents and Cost
  work as for any run;
- the split stage's chunks as a `ChunkReport`, with the chunk offsets recorded
  since September, so the document view draws them.

A trace is an ordinary report with one more section, `trace`, listing the stages
in order with the fields above. It opens in `complydoc ui` like any run of the
folder its documents came from, and sits on the Runs page beside the audits.

## In the viewer

- **A Trace page:** the stages left to right, each a card with its component,
  parameters, counts in and out, and time. Between stages, what changed:
  "−2 identifiers", "+3 metadata keys with paths", "text cut: 4%".
- **Following a value:** pick an identifier and see which stages it was in,
  from loading to the chunks and to what went to the embedding host.
- **A document's lineage:** from the document view, what each stage did to this
  document.
- **Comparing traces:** two runs of the same pipeline, such as `chunk_size`
  400 against 1,500, side by side on the Runs page, as audits are compared now.

## Privacy and the network

- complydoc's own work in a trace stays offline, as everywhere else. The user's
  pipeline may need the network, for example an embedding API, so the guard runs
  in record mode for the block. It notes each host contacted without stopping it,
  and the trace says what went there.
- Text is kept only as the audit keeps it: masked, and only when asked. Vectors
  are never kept. Parameters are read from settings, never from arguments that
  hold document text.

## Cost

Scanning every stage's output is the expensive part, the name model most of all.

| Setting | Scans | For |
| --- | --- | --- |
| `scan="patterns"` (default) | Identifier patterns and hidden text at every stage, the name model at load and at the last stage only | Everyday use; a few percent over the pipeline's own time |
| `scan="full"` | Everything at every stage | Investigating a leak |
| `scan="off"` | Counts, parameters, timings and network only | Production, where only the shape is wanted |

The overhead is measured and reported in the trace, so a user can see what
tracing cost them.

## First version

1. The context manager and `@cd.stage`; LangChain loaders, splitters,
   transformers and embeddings; the `trace` section; scanning by patterns.
2. The Trace page, and value-following across stages.
3. LlamaIndex, through its instrumentation API.
4. `cd.autolog()`, and `complydoc check` rules on a trace, such as "no
   identifier reaches the embed stage".

## Decisions

1. **Where a trace goes, as MLflow does it.** MLflow writes runs to a tracking
   folder in the working directory and groups them under an experiment. A trace
   is written to `.complydoc/` in the working directory, the folder `complydoc ui`
   reads by default, or to `cd.observe(out=...)`. Each run is its own file,
   `<name>-<time>.json`, so runs are never overwritten. The pipeline's name plays
   the experiment's part: the viewer groups traces by name, not by the folder the
   documents came from, since one pipeline can read several.
2. **One trace per block.** The viewer groups by document inside it.
3. **Embedding is observed by default.** It is the compliance headline.
4. **Generators:** a stage read lazily ends when its generator is exhausted, or
   when the block ends if it never is, and the trace says it was not read to the end.
5. **The name is `cd.observe`.** "Trace" means a model call to LangSmith users,
   and complydoc observes documents, not models. The report section is still
   called `trace`, as MLflow's is.

## Built so far, and how

- Library classes are observed by wrapping the methods each loaded subclass
  defines, since `Embeddings.embed_documents` and most loaders' `lazy_load` are
  overridden. A class imported after the block starts is not observed; import
  first.
- A stage keeps references to what it returned while the block runs, and all
  scanning happens when the block ends, so the pipeline's timings are its own.
- The block runs in record mode: connections are let through and noted, with
  each one attributed to the stage it happened in.
- A `@cd.stage` function is one stage; library calls inside it are not recorded
  separately.
