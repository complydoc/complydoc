# Find where a value went

Given an identifier, such as an account number or an email address, complydoc
lists every document it was read from, every step of a pipeline that still held
it, and every host it was sent to, across all the runs in a folder.

```bash
complydoc find "GB82 WEST 1234 5698 7654 32"
```

```text
IBAN  •••• •••• •••• •••• ••54 32  in 3 runs of 3 reports

contracts-ingest  pipeline, 2026-10-13 21:34  e8dd1c8
  in       employee-record.pdf  page 1
   1  DirectoryLoader  load, 1 time
   2  StripPathMetadata  transform, 1 time
   3  RecursiveCharacterTextSplitter  split, 1 time
   4  InMemoryVectorStore  store, 1 time  → localhost
  sent to  localhost
```

Left out, the value is asked for without being shown, which also keeps it out of
your shell history. `--in` names report files or folders to search, and defaults
to `.complydoc`. `--json` prints the result as JSON. In the viewer, the **Find a
value** page asks the same question of every run it serves.

## Taking a value out of the index

A request to erase someone's data reaches the vector store too. For each store a
recorded pipeline wrote to, the search names the items holding the value, under the
IDs the store gave them, and the call that removes them:

```text
   3  Chroma  store, 1 time
      stored as 1 item in contracts: f5c9c9bf-dc77-4c03-bed8-edecf5d1c54d
      to remove them: vector_store.delete(ids=['f5c9c9bf-dc77-4c03-bed8-edecf5d1c54d'])
```

The call is LangChain's `delete(ids=...)` or LlamaIndex's `delete_nodes(node_ids=...)`,
whichever the store is. A few LlamaIndex stores have no `delete_nodes`; for those, delete
by the source document with `vector_store.delete(ref_doc_id)`, which removes every node
read from it. Run the call on the store your pipeline wrote to; complydoc changes
nothing outside its own files. The viewer's **Find a value** page shows the same items
and the call, with a button to copy it.

The IDs are the ones the store returned, the ones given to it as `ids=`, or the ones the
documents carried themselves, as text, numbers or UUIDs. A value in an item's metadata
counts as well as one in its text. A store that says none of these is named without IDs
rather than with a guess. An ID that is itself a path or holds an identifier is not kept
in the report, so the value does not end up there too: such items are counted instead,
and found again by their content. Two collections are two steps, each with its own call. Only runs recorded from 0.7.6 on keep the IDs, and the search
covers what a recorded run stored: chunks added to the index by other means are not in it.

## What is searched

Reports do not hold the values they found, only a fingerprint of each one: a
hash of its category and its characters. The value you give is hashed the same
way and the reports are searched for the hash. So the question can be asked of
reports that never held the value, and the value asked about is written nowhere.

For a pipeline recorded with [`cd.observe`](observe-a-pipeline.md), every step is
listed, the ones that never held the value too: where it stopped is as much the
answer as where it went. A run that masked identifiers shows the step after which
the value was gone.

A value is found only where a run looked for its kind and read it as it is
written here. Spacing does not matter. A finding's fingerprint can be given in
place of the value.

A fingerprint is not a secret: a value with few possibilities can be recovered
from one by trying them all.

From Python:

```python
import complydoc as cd

trail = cd.find_value("GB82 WEST 1234 5698 7654 32", ".complydoc")
for run in trail.runs:
    print(run.name, run.sent_to)
```
