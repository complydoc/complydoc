# Name detection models

Person and organisation names are found by a named entity recognition model. A
category names the detectors to try, in order: the shipped configuration prefers
the multilingual `Babelscape/wikineural-multilingual-ner` and falls back to
spaCy's `en_core_web_sm`, so a plain install still finds names and an install
with the `multilingual-names` extra finds more of them. Each link names its own
model in `sensitive.categories.<id>.model`, and any setting can be changed with
`Config.override`.

`complydoc doctor` reports which model is available, and every report records
which one answered for each category.

## Names found by rule

Some names need no model: a person's name after its label, and a company by its form.

```text
Name: Jane Doe                 →  Jane Doe            (after "Name:" at the start of a line)
Approved by John Smith         →  John Smith          (after "approved by", "signed by", …)
Employer: Acme Holdings Ltd    →  Acme Holdings Ltd   (ends in Ltd, GmbH, S.A., Lda, …)
```

These are `patterns` on the `person_name` and `organisation_name` categories, applied
beside whichever model reads them, so a name the model missed is still found. A find the
model also made is counted once.

Where no name model is installed, the rules still mask what they find, in reports and in
traces, but they report nothing: the category is "not scanned", and a count from the rules
alone would read as its count.

In a pattern, a group called `value` is the identifier and a group called `label` is what
it was found by, so in `Name: Jane Doe` only the name is masked.

## Your own spaCy model

```python title="custom_ner_model.py"
--8<-- "examples/custom_ner_model.py"
```

| Setting | Meaning | Default |
| --- | --- | --- |
| `name` | An installed spaCy package, such as `en_core_web_trf`, or a path to a saved pipeline | `en_core_web_sm` |
| `entity_labels` | Labels reported for the category, such as `PERSON`, `PER`, `ORG` | `[PERSON]` or `[ORG]` |
| `by_language` | Models by ISO 639-1 code, each with `name` and optional `entity_labels` | none |
| `spans_key` | Read entities and scores from `doc.spans[spans_key]` | none: `doc.ents`, no score |
| `drop_short_acronyms` | Drop single all-caps tokens of up to five characters | `true` |
| `drop_multiline` | Drop entities that span a line break | `true` |
| `drop_numbered_headings` | Drop an all-capitals entity that ends in a bare number, such as `CONDITIONS 4` | `true` |

Label names depend on the model: spaCy's English pipelines use `PERSON` and `ORG`;
most other spaCy language pipelines and the multilingual `xx_ent_wiki_sm` use `PER`
and `ORG`.

### Models per language

With `by_language`, each page's language is detected locally (py3langid) and the
matching model is used. Pages with fewer than 60 letters, or a language with no
entry, use `name`. A model name can appear under several languages.

### Confidence

spaCy's `doc.ents` carries no score, so findings have `confidence: null` and the
category's `min_confidence` does not apply. A pipeline with a span categorizer
stores scores on a span group; set `spans_key` to its key (commonly `sc`) and
`min_confidence` to drop low-scoring spans. Findings are reported at the `model`
evidence tier either way.

### Filters

The filters are tuned for English business forms. `drop_short_acronyms`
removes field labels such as `IBAN` or `VAT` that the small English model tags as
organisations; `drop_multiline` removes entities that join the end of one line to
the start of the next; `drop_numbered_headings` removes a heading run into the
number of the clause after it, such as `CONDITIONS 4`. Turn them off for models
that do not make those mistakes.

## The multilingual model, which ships as the preferred one

`en_core_web_sm` is small and English. On the benchmark corpus it finds two
thirds of the names and reads field labels such as `KUNDENDATEN` as
organisations; the multilingual model finds all of them, at better precision.
On whole documents the gap is wider still. The numbers are in
[Detection accuracy](../explanation/accuracy.md).

It is preferred by the shipped configuration, so this is what to install to get
it. Without the extra the fallback runs instead and nothing breaks.

Install the extra and fetch the weights once. Fetching reaches the network, so
it happens here rather than during a scan:

```bash
uv tool install --force "complydoc[multilingual-names]"
"$(uv tool dir)/complydoc/bin/python" -c "from transformers import pipeline; \
    pipeline('token-classification', model='Babelscape/wikineural-multilingual-ner')"
```

With pip, `pip install "complydoc[multilingual-names]"` and run the second command
with your own `python`. In a checkout of this repository, `uv sync --extra
multilingual-names` and `uv run python`. `complydoc doctor` prints the command for
whichever piece is missing.

Then point the two categories at the `token_classifier` detector:

```yaml title="sensitive.yaml"
categories:
  person_name:
    detector: token_classifier
    min_confidence: 0.9
    model:
      name: Babelscape/wikineural-multilingual-ner
      entity_labels: [PER]
  organisation_name:
    detector: token_classifier
    min_confidence: 0.9
    model:
      name: Babelscape/wikineural-multilingual-ner
      entity_labels: [ORG]
```

A confidence floor is worth setting here, which it is not for spaCy's `doc.ents`:
this detector reports the model's own score, so `min_confidence` applies. On the
corpus 0.9 removes two wrong flags and costs no names.

The weights are read from files already on the machine. A model that is not
there is reported as a category that could not be scanned, with how to fetch it,
because a scan runs inside the network guard and downloads nothing. Pages are
cut into windows first: the model reads a few hundred tokens at a time, and a
name further down the page would otherwise never be seen.

`complydoc doctor` reports whichever model the configuration names.

## Models from other libraries

A model from another library is added as a detector. The detector receives the
page text and the category configuration, and returns `cd.Finding` spans with a
confidence:

```python title="token_classifier_detector.py"
--8<-- "examples/token_classifier_detector.py"
```

The model has to load from local files: scans run inside the network guard.
Registration applies to the current process, so audits with `jobs` above 1 do not
use it.

## Availability

`complydoc doctor` lists every configured model and whether it loads. A category
whose model cannot be loaded is reported as not scanned, and `run.ner_available` is
true only when every configured model loads.

Where the count is read, the run says which categories nothing was looked for: a
row in the CLI summary beside the item count, and a notice above the findings on
the viewer's Security page. A category that was never scanned counts
zero findings, which on its own reads the same as a category that is clean.
