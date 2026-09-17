# Hidden content

The security scan reports passages a model would read that a person reading the
document would not see, and passages that read as instructions to a model. Each
passage carries two levels of evidence, one per question, and a severity derived
from both.

## Visibility

| Level | Meaning |
| --- | --- |
| `visible` | The text was checked and a reader sees it |
| `not_measured` | There was nothing to check against, such as loader output with no file |
| `suspected` | One signal: nothing is drawn where the text layer has the text |
| `confirmed` | A fact read from the file explains why the text is not seen |

### PDF

Each page is drawn at `visibility.render_dpi`. For each character in the text
layer, the pixels under its box are compared: a spread smaller than
`visibility.min_contrast` grey levels means nothing visible is drawn there.

Where the page is blank under the text, the file is read for a reason:

- invisible or clip-only text render mode
- white or fully transparent fill

A blank area with a reason is `confirmed`; without one (text under a filled
shape, clipped, or in a hidden layer) it is `suspected`. Text outside the crop
box and text below `visibility.min_font_size_pt` is `confirmed` whatever the
pixels show.

Invisible render mode over an image of the same words, as on a scanned page
with an OCR layer, has ink under it and is not reported.

Rotated pages and pages after `visibility.max_pages` are not checked.

### Word

Read from the markup, including styles and their base styles:

- `w:vanish` (hidden text)
- white text with no shading, highlight or page colour behind it
- text below `visibility.min_font_size_pt`

### Excel

Hidden and very hidden sheets, hidden rows and columns, cells whose number
format displays nothing (`;;;`), and white text on an unfilled cell.

### PowerPoint

Hidden slides, shapes placed entirely outside the slide area, and text below
`visibility.min_font_size_pt`. Positions inside grouped shapes are not checked.

### HTML

Read from the markup and from `<style>` rules whose selector is a tag, a class,
an id, or a tag with a class or id:

- the `hidden` attribute
- `display: none`, `visibility: hidden`, `opacity: 0`
- transparent text, and white text with no background set on it or an ancestor
- text below `visibility.min_font_size_pt`, and zero height with hidden overflow
- comments

Text positioned 500pt or more off screen is `suspected`. Web pages hide menus,
dialogs, licence notices and comments routinely, so a hidden HTML passage is
reported only when it reads as an instruction.

### Markdown

HTML comments and link references used as comments (`[//]: # (...)`), which are
not rendered, and inline HTML hidden as above. Code blocks and inline code are
ignored. As for HTML, a hidden passage is reported only when it reads as an
instruction.

### Email

The HTML body of an `.eml` file is checked as HTML, whichever body part the page
text came from.

### Any text

- Unicode tag characters (U+E0000 to U+E007F) are decoded to the ASCII they
  spell.
- A run of `visibility.zero_width_run` or more zero-width characters is
  reported as a payload.
- A bidirectional override (U+202D, U+202E) is `suspected`.

These apply to loader output and extracted text as well as files.

## Instruction

| Level | Meaning |
| --- | --- |
| `confirmed` | Text decoded from invisible tag characters |
| `pattern` | Matches a pattern in `hidden.yaml` |
| `model` | A registered classifier scored it at or above `instructions.classifier_threshold` |
| `none` | Neither |

Patterns run on the text with invisible characters removed, so
`ig​nore previous instructions` still matches.

Every pattern runs against every document. `languages` on a pattern in
`hidden.yaml` records which languages its regexes were written for; it does not
restrict where they run, because an injected instruction can be written in a
language the surrounding document is not. The shipped patterns cover English,
Portuguese, Spanish, French, German, Italian and Dutch, apart from
`role_marker`, which matches markup rather than words.

### Classifier

A pattern finds an instruction by its wording, so it answers yes or no and
cannot say how sure it is. A classifier gives a number instead, and
`complydoc.integrations.typesafe.jev_classifier` is one: it asks a hosted model,
for each passage, how likely it is to be addressed to a model rather than to a
person.

What that buys depends on where the threshold sits, and the measured numbers are
in [Detection accuracy](accuracy.md). An instruction written plainly scores near
1 and ordinary prose near 0, including prose that talks about AI without
addressing one. Phrasing that only hints at a reading machine lands in the
middle, so at the shipped threshold of 0.8 it is not reported: lowering the
threshold is what catches those, and the cost of doing so is measured on the same
page.

It is the only part of complydoc that sends document text anywhere. Passing
`allow_network=True` is required, the call is let through the guard one call at a
time, and the connections made are returned so a run can record them. A folder
large enough to be split across worker processes will not use it: a classifier is
registered in one process. `jobs=1` keeps it in reach.

```python title="jev_classifier.py"
--8<-- "examples/jev_classifier.py"
```

No model is shipped or downloaded, and nothing is registered by default. A
classifier is any function from text to a score between 0 and 1:

```python
import complydoc as cd
from transformers import pipeline

classify = pipeline("text-classification", model="/models/injection-classifier")
cd.register_instruction_classifier(
    lambda text: next(r["score"] for r in classify(text[:2000]) if r["label"] == "INJECTION")
)
```

It runs inside the network guard, so the model has to load from local files. It
is registered in the calling process only; audits with `jobs` above 1 do not
use it.

## Severity

| Visibility | Instruction | Severity |
| --- | --- | --- |
| suspected or confirmed | pattern or confirmed | high |
| confirmed | model | high |
| suspected | model | medium |
| suspected or confirmed | none | medium |
| visible or not measured | confirmed | medium |
| visible or not measured | pattern or model | low |

## Report

`report.documents[i].content_findings` holds the passages;
`report.aggregate.content_matrix` counts them by instruction level, then by
visibility. The Security page draws the counts as a matrix; selecting a cell
filters the table under it. Excerpts are masked by the identifier scan unless
the run used `reveal`.

For loader output with a readable source file, each hidden passage records in
`in_loader_output` whether the loader's text contains it.

## Limits

- Text inside images is not checked. A vision model reads it.
- HTML styles from external stylesheets, scripts and complex selectors are not
  applied.
- Patterns miss phrasings they do not list and match documents that discuss
  prompt injection.
- A document with no findings has not been shown to be safe.
