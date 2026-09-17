# Drafting quick wins

`complydoc assist` reads a report an audit already wrote and asks a hosted chat
model what to do about it: where readiness is being lost, and which loader read
the folder best.

```bash
complydoc audit ./documents --out build --name current
complydoc assist --report build/current.json
```

```
- Turn on OCR for the three scanned invoices
  They have no text layer, so nothing was read from them and they were not scanned
  for identifiers.
```

Every other report in complydoc is computed on the machine it runs on, this one
included: `quick_wins[]` in the JSON is written by an audit without any model.
`assist` is a second opinion on top of that, and it is the part that leaves.

## What it sends

The report, as JSON, to the model you name. That is:

| Sent | Held back |
| --- | --- |
| Findings, with identifiers masked | The text read off each page |
| Readiness signals and their reasons | The page pictures, if the run embedded any |
| Routing, loaders, extractions, timings | Every priced model against every document |
| Cost totals, limitations, run metadata | |
| Document paths and file names | |

Masked identifiers and the paths of your documents are in what goes. A path can
name a client. If that matters, audit a copied folder with neutral names, or do
not use this command.

Holding back the page text and the page pictures is not only about privacy. The
ten-page sample report is 509,000 tokens if sent whole with pictures, and 52,000
once those parts are dropped. What remains grows with the folder, at roughly
5,000 tokens a document, so a large folder needs `--sample` on the audit that
wrote the report, or a model with room for it. The command says so before it
sends anything large.

## Install and run

```bash
uv tool install --force "complydoc[assistant]"
export OPENAI_API_KEY=...        # whatever the model you name expects
complydoc assist --report build/current.json --model gpt-5.6-luna
```

The extra brings LangChain, which resolves `--model` through
`init_chat_model`, so any provider LangChain supports works if its package and
its key are present.

Before the call, the command names the model it is about to send to. After it,
it lists the hosts that were reached.

## From Python

```python
import complydoc as cd
from complydoc.integrations.assistant import quick_wins_call

report = cd.load_report("build/current.json")
message = quick_wins_call(report, allow_network=True)
for win in message.quick_wins:
    print(win.quick_win, "-", win.justification)
```

`allow_network=True` is required and defaulted nowhere. Without it the call
raises `ValueError` rather than quietly sending the report.
`connections_made()` returns the hosts reached.

## What it does not do

- It does not run as part of `audit`, `check` or a policy gate.
- It does not write the drafted wins into the report. What it prints is the
  model's answer, not a finding complydoc stands behind.
- It does not change `run.content_sent_to` in the report it read. That field
  records what the audit itself sent, which is nothing.
