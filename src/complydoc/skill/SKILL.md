---
name: complydoc
description: Check documents offline before they reach an LLM: what processing them would cost, how reliably their text can be read, which personal and financial identifiers they hold (national IDs across Europe, the Americas, India and Australia, payment cards, IBANs, bank details, names), and whether anything hidden in them is addressed to a model (white or invisible text, prompt injection). Use when asked what documents would cost to process with an LLM, how ready they are to extract from, whether a folder contains personal data or hidden instructions, which document loader or parser reads a folder best, to gate documents in CI with a policy, or to make masked copies before sending them anywhere. Runs locally; no document content leaves the machine unless a hosted classifier is explicitly requested.
---

# complydoc

`complydoc` checks a folder of documents, or the output of a document loader, before
it is sent to a model. It reports four things: what processing it would cost, how
reliably text can be read off each page, which personal and financial identifiers it
contains, and whether any text in it is hidden from a reader or addressed to a model.
A network guard blocks outbound connections for the whole run, so it is safe to run on
material that must not leave the machine.

## Running it

```bash
complydoc audit <path> --print-json
```

`--print-json` puts the report on stdout and nothing else; progress goes to stderr.
Parse stdout. Without it, the tool writes `.complydoc/complydoc.{html,json}` and prints
both paths. `complydoc` with no arguments audits the current directory; it does not
take a path, so use `complydoc audit <path>` for anything else.

| Command | Scope |
| --- | --- |
| `complydoc audit <path>` | Every check: cost, readiness, identifiers and hidden content |
| `complydoc cost <path>` | Cost only |
| `complydoc readiness <path>` | Extraction readiness only |
| `complydoc sensitive <path>` | Identifiers and hidden content only |
| `complydoc routing <path>` | Which pages need the text layer, local OCR or a vision model, priced as a mix, written as a manifest |
| `complydoc compare-readers <path>` | Every installed PDF reader and OCR engine on the same pages |
| `complydoc compare-loaders <file.yaml>` | Several document loaders (LangChain, LlamaIndex, Docling…) on the same files, from a YAML description |
| `complydoc chunks <path> --splitter module:attr` | Chunks a text splitter makes: sizes, cut sentences and tables, identifiers, facts |
| `complydoc check <path> --policy policy.yaml` | Rules written in YAML; exits 1 when one fails and 2 when the policy will not load; `--markdown`, `--sarif` |
| `complydoc diff <old.json> <new.json>` | Changes between two reports; exits 1 when something got worse |
| `complydoc clean <path> --out <dir>` | Safe copies: identifiers masked, metadata removed, `--rasterise` for PDFs; `--show` lists what changed |
| `complydoc assist --report <report.json>` | Drafts quick wins from a finished report with a hosted chat model. **Sends the report to that model**; needs the `assistant` extra |
| `complydoc doctor` | What is installed, what is missing, and the command that adds it |
| `complydoc models` | Which models can be priced against (`--new N` for the latest, `--all` for every one) |
| `complydoc benchmark` | What identifier detection finds and wrongly flags, against a labelled corpus |
| `complydoc schema` | The shape of the report JSON |

Useful flags: `--monthly-volume N` extrapolates cost, `--model <id>` (repeatable)
narrows the comparison, `--no-ocr` is faster, `--out <dir>` moves the reports,
`--password <pw>` is tried on encrypted PDFs, `--timeout N` stops a document that hangs,
`--no-extracted-text` leaves the document text out of the report.

On a folder large enough to be slow, `--jobs 0` spreads the work over every CPU and
`--sample N` audits N documents instead of all of them. Prefer `--jobs`: it changes only
how long the run takes. Reach for `--sample` when the user has accepted a partial answer,
and say in your reply that the figures describe a sample.

To gate a repository on GitHub, the repository is also an action:
`uses: complydoc/complydoc@v<version>` with `path` and `policy` inputs runs `check`,
comments on the pull request and can upload SARIF.

Exit code 0 means the run completed, 2 means the arguments or config were wrong. A run
that finds problems still exits 0, and the findings are in the JSON. Only `check` and
`diff` exit 1 on findings.

### Flags that change what leaves the machine or the report

Do not pass these unless the user asked for exactly that:

- `--classifier jev` sends the passages it judges to api.typesafe.ai. The run says so,
  and `run.content_sent_to` names the host. Everything else stays local.
- `complydoc assist` sends a finished report to a hosted chat model: its findings, signals,
  loaders and costs, with the page pictures and page text held back. It is a separate
  command, never part of an audit, and the quick wins in `quick_wins[]` are computed
  locally without it.
- `--reveal` writes identifiers unmasked into the findings, the page text and
  `--save-text` files.
- `--page-images` embeds a picture of every page in the HTML report. A picture shows
  every value on the page, so the report then holds them all.

## Reading the JSON

```bash
complydoc audit ./invoices --print-json | jq '{
  readiness: .overall.score,
  sensitive_docs: .aggregate.documents_with_sensitive_data,
  high: [.documents[].sensitive.matches[] | select(.severity=="high")] | length,
  hidden_high: .aggregate.content_findings_high,
  not_scanned: .aggregate.categories_not_scanned,
  unread: [.documents[] | select(.sensitive.unreadable_pages|length>0) | .relative_path],
  sent_to: .run.content_sent_to,
  important: [.limitations[] | select(.severity=="important") | .area]
}'
```

- `run.components_run`: which components ran.
- `run.offline_guard`: `armed` means nothing could leave the machine on its own.
  `run.content_sent_to` lists any host a classifier sent passages to; empty is normal.
- `overall.score`: readiness, 0-100, from content, cost path and exposure combined.
  `overall.factors[]` says what went into it and what weight each carried; a factor
  with a null score was not measured and was left out rather than counted as nought.
  `overall.bands` counts documents per band, which is what the mean hides.
- `documents[].readiness.score`: the content factor alone, 0-100, whether the text
  can be read off the page. Check `low_confidence`.
- `quick_wins[]`: what to do next, most documents first. Each names its
  `documents`, and `actor` says whether complydoc can do it or a person must.
- `documents[].sensitive.matches[]`: `category`, `page`, `line`, `masked`,
  `severity`, and `evidence`: `confirmed` (a checksum passed), `corroborated` (a
  label sits next to it), `pattern` (shape only), `model` (a statistical guess,
  the weakest). `confidence` is null where the detector produces no score, which
  is never to be treated as certainty.
- `documents[].content_findings[]`: passages hidden from a reader or addressed to a
  model: `visibility` (`confirmed`, `suspected`, `not_measured`, `visible`),
  `instruction` (`confirmed`, `pattern`, `model`, `none`), `severity`, and a masked
  `excerpt`. A high-severity one is hidden text telling a model what to do.
- `documents[].cost.models[]`: token counts and USD per model, with `price_source`
  (`verified` or `imported`) and `last_verified`.
- `aggregate.seconds_per_document` and `hours_per_1000_documents`: measured local
  preparation time, and `ocr_pages_per_second` where OCR ran.
- `limitations[]`: what this run could not establish, generated from the run itself.

## What is easy to get wrong

**Zero is not always zero.** A page in `sensitive.unreadable_pages` was never read. A
category in `aggregate.categories_not_scanned` was never searched for, which on an
install without a name model includes person and organisation names. Both report zero and
neither is an all-clear. Say so when reporting a clean result, and point at
`complydoc doctor`, which prints the command that adds the missing part.

**Masking is only as good as detection.** Every value that was found is masked in the
findings, the page text and saved text. A value detection missed, most often a name,
is still in the page text. Quote `masked` values only. `--no-extracted-text` produces a
report with no document text at all, which is the safer choice when the report will be
shared.

**Hidden-content checks do not read images.** Text inside a picture, which a vision model
reads, is not checked. Instruction patterns cover English and six other European
languages; other wording is found only with a classifier.

**A price is either verified or imported.** A few models carry a price verified against
the provider's page; the rest come from a third-party table and are unchecked, which
`limitations[]` notes under `Price provenance`. Include that caveat when quoting a figure.

**Costs are input tokens only.** Output cost depends on the prompt, which complydoc
cannot know, so the real bill is higher.

**A sampled run does not describe the folder.** When `run.sampled_from` is set, every
total, monthly figure and count covers only the documents that were read. Report them as
a sample of that many out of `run.sampled_from`.

**Timing is local only.** `seconds_per_document` is the cost of reading and analysing a
document on this machine, before anything reaches a model.

## Reporting back

Lead with the figures a decision rests on: cost per 1,000 documents, the readiness
score, how many documents hold identifiers, and whether any hidden instruction was found.
Then name anything in `limitations[]` marked `important`, because those are the things
that would change the conclusion. Never print identifier values.
