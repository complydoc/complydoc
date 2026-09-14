# Streaming, caching and pipeline steps

```python title="streaming_and_steps.py"
--8<-- "examples/streaming_and_steps.py"
```

## Streaming an audit

`cd.iter_audit(target, components=..., **options)` yields a `DocumentReport` for
each document as it is read, and a `SkipRecord` for each file that was skipped. It
takes the same options as `full_audit`. `cd.aiter_audit` is the asynchronous
version, reading each document in a worker thread.

The network guard is armed while each document is read and released between them.
Because the guard replaces socket functions for the whole process, other threads
cannot open connections while a document is being read.

A missing path raises `FileNotFoundError` when `iter_audit` is called.

## Caching loader output

`compare_loaders(..., paths=..., cache_dir=...)` stores each loader's output per
file. On a later run, a file whose content and loader name match an entry is not
parsed again. Each loader's row reports `cached_files`, and the report notes that
load time and network attempts cover only the files that were parsed.

Entries are keyed by loader name and the file's SHA-256. Give a loader a different
name when its options change. The cache holds document text as JSON.

## Pipeline steps

A step returns copies of documents with text or metadata changed, and records each
change in `step.changes`. Steps accept LangChain documents, LlamaIndex nodes,
mappings with `page_content` or `text`, and strings.

| Step | Changes |
| --- | --- |
| `cd.MaskIdentifiers(metadata=True)` | Replaces identifiers in the text, and in string metadata values |
| `cd.DropHiddenPassages(drop_document=False)` | Removes invisible characters and instruction-like sentences, or drops the document |
| `cd.StripPathMetadata()` | Replaces absolute paths in metadata with the file name |

`DropHiddenPassages` works on text. Hidden formatting in a source file, such as
white text in a PDF, is found by an audit.

In a LangChain pipeline call `step.transform_documents(documents)`, or wrap the
step with `complydoc.integrations.langchain.as_transformer(step)` to get a
`BaseDocumentTransformer`. In LlamaIndex, wrap it with
`complydoc.integrations.llamaindex.as_transform(step)` to get a
`TransformComponent` for an `IngestionPipeline`.
