# Your own concepts

complydoc ships with the identifiers most organisations share: bank details, tax
numbers, names, addresses. Your documents also carry things only you know to look
for, such as a policy reference, a case number, or an ID from an internal system.
A concept describes one of these in words, with a pattern to find it.

```yaml title=".complydoc-concepts.yaml"
schema_version: 1
concepts:
  - id: tariff_engine_id
    label: Tariff engine ID
    description: An identifier from our insurance tariff engine, such as TE-2024-00012.
    pattern: 'TE-\d{4}-\d{5}'
    severity: high
```

An audit reads `.complydoc-concepts.yaml` at the top of the folder it audits, or
the file `--concepts` names. Each concept with a pattern is looked for like any
identifier:

- it's masked in the report and fingerprinted
- it's counted under its severity, and `complydoc check` holds it to the policy
- it can be ignored with a reason
- the report's `concepts` section says how often each was found

| Field | Meaning |
| --- | --- |
| `id` | Lower-case letters, digits and underscores. The finding's category is `concept_<id>`. |
| `label` | The name shown for each finding. |
| `description` | What it is, in words, for the report and for whoever reads the file. |
| `pattern` | A regular expression, matched ignoring case. Optional when `judge` is set. |
| `severity` | `low`, `medium` or `high`. `medium` when left out. |
| `judge` | Also have a judgement model read each page for it. See below. |

A pattern that matches empty text is refused, since it would match everywhere.
OCR sometimes runs words together, for example "InvoiceNB-2026-0041", so a
leading `\b` can miss a value that's glued to the word before it.

## From the viewer

Under `complydoc ui`, the Settings page lists your concepts with how often each was
found on the run you're viewing, and adds, edits and removes them. It writes the
file beside the documents. A pattern can be tried on some text before it's saved.
Changes apply from the next run.

## Judged by a model

Some concepts have no shape a pattern can catch: a renewal offer, a medical
opinion, a mention of a named project. Mark such a concept `judge: true`, with or
without a pattern, and ask for a judge on the run:

```bash
complydoc audit ./documents --judge-concepts jev
```

Jev, TypeSafe's judgement model, is then asked of each page whether it holds the
concept, with the concept's own label and description as the question. A page it
puts at 0.5 or more is reported under the document's `concept_findings`, with its
score. A model says whether a page holds the concept, not where, so the finding
is the whole page, reported at the weakest evidence tier.

This **sends page text to TypeSafe**, which nothing else in complydoc does
unless you ask. It needs the `typesafe` extra and a key in `JEV_KEY`, and the
report names the hosts the text went to. A page where the concept's pattern
already found it is not asked again. A question that fails is counted and said
in the report, not taken as a page that holds nothing.

On a run without `--judge-concepts`, the report says which concepts were meant
for a model. A concept with no pattern wasn't looked for at all, and the report
flags that as important.

From Python, pass a judge of your own: any function taking a label, a description
and a page's text and returning a probability.

```python
report = cd.security_audit("~/policies", judge_concepts=my_judge)
```
