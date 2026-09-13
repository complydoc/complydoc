# complydoc

Point it at a folder of business documents. It tells you what they would cost to
process with an LLM, how ready they are to extract data from, and what personal
or financial information they hold.

It is a diagnostic you run **before** buying or building a document automation
system. It is not a pipeline, and it does not extract your data for you.

```bash
uv tool install complydoc
complydoc demo
```

`demo` audits six synthetic samples that ship with the tool, so you can see a
report without finding a folder first.

```text
Documents         6 (6 pages)
Text path         $0.0001
Vision path       $0.0009
AI readiness      77.4/100 (content)
Global readiness  82.4/100 ready
Sensitive items   20 in 4/6 docs

2 important limitations — see the report before drawing conclusions.
```

Then the report opens:

![The complydoc report](https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/report-light.png#only-light)
![The complydoc report](https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/report-dark.png#only-dark)

Next: [audit your own folder](guides/audit-a-folder.md), or
[get masked text](guides/text-for-a-pipeline.md) for a pipeline.

## It makes no network calls

Not as a policy — as a mechanism. The guard replaces the standard library's
outbound socket and DNS entry points before any file is opened, and the test
suite runs a full audit with it armed. Every report records whether it was
active.

So you can run this over the documents you are not allowed to upload. That is
the point of it. → [Offline by construction](explanation/offline.md)

## What it won't claim

- **Masked text is not certified clean.** Names have no checksum to pass, so a
  model finds them, and models miss. Every extraction says so.
- **A signal that could not be measured is not a zero.** It says it was not
  measured, with the reason, and stays out of the score.
- **A price nobody checked says so.** Imported prices are kept apart from the
  few verified against a provider's own page.
