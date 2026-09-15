# Inspecting chunks

`cd.inspect_chunks(splitter, documents)` splits documents and reports on the
chunks. `cd.compare_chunkers({name: splitter}, documents)` does the same for
several splitters.

```python title="inspect_chunks.py"
--8<-- "examples/inspect_chunks.py"
```

## Input

| `splitter` | Called as |
| --- | --- |
| LangChain text splitter | `split_documents(documents)` |
| LlamaIndex node parser | `get_nodes_from_documents(documents)` |
| Callable | `splitter(documents)` |

`documents` is anything `inspect_documents` accepts, including a loader. With
`documents` omitted, `splitter` is taken to be chunks that were already made.

## Per chunk

`report.chunks` holds an `InspectedChunk` per chunk: source document and page,
characters, tokens (from `model`'s encoding, or the headline model's),
identifiers as masked values, the number of hidden passages of medium severity or
above, metadata keys, a masked preview, and flags:

| Flag | Set when |
| --- | --- |
| `tiny` | Fewer than `min_tokens` tokens (20) |
| `oversized` | More than `max_tokens` tokens, when given |
| `split_sentence` | The chunk ends without closing punctuation and the next chunk of the same document starts in lowercase |
| `split_table` | The last line and the next chunk's first line both look like table rows |
| `heading_at_end` | The last line is a Markdown heading or a short line in capitals |
| `duplicate` | The same text, ignoring whitespace, appeared in an earlier chunk |
| `path_metadata` | A metadata value is an absolute file path |

## Per splitter

- `report.stats`: count, total, minimum, median, 95th percentile and maximum tokens
- `report.flag_counts`: chunks per flag
- `report.repeated_identifiers`: identifiers found in more than one chunk
- `report.facts`: a `FactLocation` per expected fact, with status `whole` (inside
  one chunk, listed in `chunks`), `split` (only in the joined document text, so a
  chunk boundary cuts it) or `missing`

`report.to_pandas()` returns one row per chunk; `comparison.to_pandas()` one row
per splitter.

## From the command line

```bash
complydoc chunks ./contracts \
  --splitter "langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=800" \
  --splitter "langchain_text_splitters:RecursiveCharacterTextSplitter chunk_size=1500" \
  --fact "Payment is due within thirty days" --max-tokens 1000
```

Each page's text is read as `extract_text(mask=False)` reads it and passed to the
splitter as documents with `source` and `page` metadata. `--splitter` takes a
`module:attribute` followed by `key=value` arguments, read as YAML values. A class is
created with the arguments; a function is called with the documents and the
arguments. Repeating `--splitter` compares them.

The command writes `complydoc-chunks.json` and `complydoc-chunks.html` to `--out`
(`.complydoc` by default). Both hold masked previews and identifiers, not the
document text. `cd.write_chunks_html(report, path)` writes the same page from
Python, for a `ChunkReport` or a `ChunkComparison`.
