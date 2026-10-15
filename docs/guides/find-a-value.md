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
