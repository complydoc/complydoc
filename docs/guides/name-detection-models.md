# Name detection models

Person and organisation names are found by a named entity recognition model. The
shipped configuration uses spaCy's `en_core_web_sm` (the `ner` extra). Each category
that uses the `ner` detector names its model in `sensitive.categories.<id>.model`,
and any setting can be changed with `Config.override`.

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

The two filters are tuned for English business forms. `drop_short_acronyms`
removes field labels such as `IBAN` or `VAT` that the small English model tags as
organisations; `drop_multiline` removes entities that join the end of one line to
the start of the next. Turn them off for models that do not make those mistakes.

## Recommended: a multilingual model

`en_core_web_sm` is small and English. On the benchmark corpus it finds two
thirds of the names and reads field labels such as `KUNDENDATEN` as
organisations; a multilingual token-classification model finds all of them, at
better precision. The numbers are in
[Detection accuracy](../explanation/accuracy.md).

Install the extra and fetch the weights once. Fetching reaches the network, so
it happens here rather than during a scan:

```bash
uv sync --extra multilingual-names
uv run python -c "from transformers import pipeline; \
    pipeline('token-classification', model='Babelscape/wikineural-multilingual-ner')"
```

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
the report's Sensitive information page. A category that was never scanned counts
zero findings, which on its own reads the same as a category that is clean.
