# Detection accuracy

What identifier detection finds, and what it reports that it should not, measured
against a labelled corpus that ships with the package.

```bash
complydoc benchmark            # the scores
complydoc benchmark --verbose  # every miss and every wrong flag, named
complydoc benchmark --json scores.json
```

## The corpus

32 passages holding 50 labelled identifiers across 37 categories, and 8 passages
labelled as holding nothing at all. Every value in it is fake, a published test
value, or a documented example.

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

`person_name` and `organisation_name` are left out. They come from a statistical
model rather than a pattern, and this corpus labels no names, so a name the model
found could be scored neither as a hit nor as a wrong flag. Leaving them in would
make the published numbers depend on whether a model happened to be installed.

## Measured

| | |
| --- | --- |
| Labelled identifiers | 50 |
| Found | 49 |
| Missed | 1 |
| Wrongly flagged | 5 |
| Recall | 98.0% |
| Precision | 90.7% |

By evidence tier, across every finding the run reported: 42 `confirmed`, 6
`corroborated`, 6 `pattern`. Of the 8 passages labelled as holding nothing, 3
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

## What these numbers do not say

The corpus is small and written by hand, so a per-category score that rests on a
single labelled value says little on its own. The passages are given to the
scanner as text, so nothing here measures extraction or OCR quality: a value that
never made it off the page cannot be found by any detector. Names are not
measured at all. A real folder carries a different mix of documents, and its
numbers will differ.

The numbers above are checked by the test suite, so a change in detection that
moves them fails the build until this page is updated to match.
