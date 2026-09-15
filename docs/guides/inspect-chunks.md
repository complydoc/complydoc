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

## Retrieval check

`questions` pairs each question with a passage that answers it. Every question is
ranked against every chunk with BM25, a keyword ranking built in, with no
embedding model or index:

```python title="retrieval_check.py"
--8<-- "examples/retrieval_check.py"
```

| Status | Meaning |
| --- | --- |
| `retrieved` | A chunk holding the fact ranks within `top_k` (5) |
| `ranked_low` | A chunk holds the fact and ranks below `top_k`, or shares no word with the question |
| `split` | No single chunk holds the fact; the text before splitting does |
| `missing` | The text does not contain the fact |

A question is a `cd.Question(text, fact, document=None)`, a mapping with
`question`, `fact` and `document`, or a `(question, fact)` pair. The fact is
matched as expected facts are, and `document` limits the answering chunks to one
file.

`report.retrieval` holds a `QuestionResult` per question: the rank of the first
chunk holding the fact, the chunks holding it, and the `top_k` best-ranked
chunks. `report.retrieval_hit_rate` is the share retrieved, and
`report.mean_reciprocal_rank` averages 1/rank over retrieved questions and 0 for
the rest. `comparison.rows()` has both per splitter.

A split or missing fact fails with any retriever. BM25 ranks by shared words, so
a question worded differently from its answer ranks low here and may still be
found by an embedding model. Use the ranks to compare splitters on the same
questions.

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

`--questions questions.yaml` runs the retrieval check, and `--top-k` sets `top_k`:

```yaml title="questions.yaml"
- question: Which accounts have no multi-factor authentication?
  fact: Two administrator accounts have no multi-factor authentication
  document: vendor-assessment.pdf
- question: When are invoices payable?
  fact: Invoices are payable within
```
