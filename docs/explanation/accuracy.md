# Detection accuracy

What identifier detection finds, and what it reports that it should not, measured
against a labelled corpus that ships with the package.

```bash
complydoc benchmark            # the scores
complydoc benchmark --verbose  # every miss and every wrong flag, named
complydoc benchmark --json scores.json
```

## The corpus

41 passages holding 68 labelled values, and 9 passages labelled as holding
nothing at all. Every value in it is fake, a published test value, or a
documented example.

53 of those values are identifiers with a shape a pattern can match, across
39 categories. The other 15 are person and organisation names, which a
statistical model finds, and they are scored apart from the rest.

The passages that hold nothing are the point of the exercise. They carry invoice
numbers, purchase orders, serial numbers, meter readings and job references,
including values that sit beside a label for a different kind of identifier,
because that is what produces wrong flags in a real folder.

## How a score is counted

A finding counts as a hit when it overlaps a labelled value and names the same
category. Scoring by overlap rather than one finding per pattern is deliberate:
when two categories match the same digits, the scanner keeps the better
evidenced one, so counting raw pattern hits would measure that resolver instead
of the detectors.

`person_name` and `organisation_name` are scored in their own group, below. A
name score describes the model that happens to be installed, so keeping it out of
the figures below is what lets them mean the same thing on every machine. The
counts by evidence tier, and the count of clean passages that produced a flag,
cover the patterns for the same reason.

## Measured

| | |
| --- | --- |
| Labelled identifiers | 53 |
| Found | 52 |
| Missed | 1 |
| Wrongly flagged | 5 |
| Recall | 98.1% |
| Precision | 91.2% |

By evidence tier, across every pattern finding the run reported: 45 `confirmed`,
6 `corroborated`, 6 `pattern`. Of the 9 passages labelled as holding nothing, 3
produced at least one finding.

## What it missed

`sort_code`, on `12 34 56`. The patterns accept `12-34-56`, and six bare digits
when a label such as "sort code" sits within 60 characters. A sort code spaced
into pairs matches neither, which is how OCR tends to render one.

## What it wrongly flagged

| Category | Value | Why |
| --- | --- | --- |
| `date_of_birth` | a contract start date | `plausible_dob` asks only whether the date is a plausible one, and the words "date of birth" appeared elsewhere within the 60-character window |
| `date_of_birth` | a review date | the same window |
| `ch_ahv` | a serial number | the digits satisfy the Swiss AHV checksum |
| `it_codice_fiscale` | a licence code | the same shape as an Italian fiscal code |
| `sort_code` | a delivery note number | six digits punctuated like a sort code |

Both date findings were reported at the `confirmed` tier, which overstates them:
a passing `plausible_dob` check means the value is a date, rather than that it is
someone's date of birth.

## Names

Names are found by a statistical model, so what follows measures the model rather
than complydoc. The corpus labels 15 names across seven languages: contract
parties, signatories and billing contacts, in the shape a supplier agreement
carries them.

| Model | Found | Wrongly flagged | Recall | Precision |
| --- | --- | --- | --- | --- |
| `en_core_web_sm` (the fallback) | 10/15 | 25 | 66.7% | 28.6% |
| `en_core_web_md` | 12/15 | 23 | 80.0% | 34.3% |
| `xx_ent_wiki_sm` | 12/15 | 21 | 80.0% | 36.4% |
| `Babelscape/wikineural-multilingual-ner` (shipped) | 15/15 | 5 | 100.0% | 75.0% |

The pattern figures above are identical under all four, which is the point of
scoring them apart.

The shipped configuration prefers the multilingual model and falls back to
`en_core_web_sm` when it is not installed, so which row describes a given run
depends on what is on that machine. The report says which model answered.

The English model misses every non-English organisation in the corpus —
`Müller Maschinenbau GmbH`, `Hermanos García SL`, `Rossi Costruzioni Srl` — and
reads field labels such as `KUNDENDATEN` and `Telefono` as names. The
multilingual model finds every name, and all 5 of its wrong flags are
organisations: it found all 8 people with none. Setting `min_confidence` to 0.9
drops two of those five, for 83.3% precision at the same recall.

The multilingual row is measured through the `token_classifier` detector, which
drops entities spanning a line break and short all-caps tokens before they are
reported. The same model read without those filters scores 53.6%, so most of
what it gets wrong is the kind of thing the filters are there for.

Read the precision column with the corpus in mind. Many of these passages are
terse field labels rather than prose, which is the setting a name model is worst
at, so these numbers are a floor rather than what a folder of contracts would
give. 15 labelled names is also few enough that one entity moves a figure by
several points.

Swapping the model is configuration, not code: see
[Name detection models](../guides/name-detection-models.md). A model from another
library is registered as a detector, and its weights have to be on disk, since
the network guard is armed while a scan runs.

### On real documents

The corpus above is short labelled passages. Run the same models over the
fixture folder, which is whole documents, and the difference is larger than the
precision column suggests:

| Model | Names reported | Obviously not a name |
| --- | --- | --- |
| `en_core_web_sm` | 41 | 9 |
| `xx_ent_wiki_sm` | 24 | 7 |
| `Babelscape/wikineural-multilingual-ner` | 9 | 0 |

The fixtures carry no name labels, so this counts what is obviously wrong rather
than what is right: a finding with digits in it, or a colon, or a single
character. `en_core_web_sm` reported `Rechnung RE-2026-0188` as a person,
`Subtotal 4,250.00` as a person and `Steuer` as an organisation. That is the
cost of a small English model on documents that are neither small nor English.

## What these numbers do not say

The corpus is small and written by hand, so a per-category score that rests on a
single labelled value says little on its own. The passages are given to the
scanner as text, so nothing here measures extraction or OCR quality: a value that
never made it off the page cannot be found by any detector. The name scores
describe one model on one small corpus rather than name detection in general. A
real folder carries a different mix of documents, and its numbers will differ.

The numbers above are checked by the test suite, so a change in detection that
moves them fails the build until this page is updated to match.
