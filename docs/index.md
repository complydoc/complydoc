# complydoc

Point complydoc at a folder of business documents and it answers three
questions: what they would cost to process with an LLM, how ready they are to
extract data from, and what personal or financial information they hold.

It is a diagnostic you run **before** buying or building a document automation
system. It is not a pipeline you run in production, and it does not extract your
data for you.

```bash
uv tool install complydoc
complydoc demo
```

`demo` audits six synthetic sample documents that ship with the tool and opens
the report, so you can see what you get before pointing it at anything of your
own.

![The complydoc report](https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/report-light.png#only-light)
![The complydoc report](https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/report-dark.png#only-dark)

## It makes no network calls

Not as a policy — as a mechanism. `offline.py` replaces the standard library's
outbound socket and DNS entry points before any file is opened, and the test
suite runs a full audit with that guard armed. Every report records whether it
was active.

That is the whole trust proposition: you can run this over documents you could
not send anywhere. See [Offline by construction](explanation/offline.md).

## Where to go next

<div class="grid cards" markdown>

-   __Run it over your own folder__

    What the report says and what to do about it.

    [Audit a folder](guides/audit-a-folder.md)

-   __Use it from Python__

    Masked text, token counts, and what could not be read.

    [Text for a pipeline](guides/text-for-a-pipeline.md)

-   __Every flag and every field__

    Generated from the code, so it cannot drift.

    [Reference](reference/cli.md)

-   __Why it works this way__

    The decisions that make the numbers trustworthy.

    [Not measured is not zero](explanation/not-measured.md)

</div>

## What it will not tell you

A diagnostic that overstates itself is worse than none, so a few things are said
plainly throughout:

- **Masked text is not certified clean.** Names have no checksum to pass, so a
  model finds them and models miss. Every extraction says so.
- **A signal that could not be measured is not a zero.** It is reported as not
  measured, with the reason, and excluded from the score.
- **A price nobody checked says so.** Imported prices are kept apart from the
  handful verified against a provider's own page.
