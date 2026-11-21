# complydoc demo

Three invented documents, each with a problem a person cannot see:

| File | What a reader sees | What is in the file |
|---|---|---|
| `cv_ana_ferreira.pdf` | An ordinary CV | A white sentence telling an AI to rank the candidate first |
| `invoice_2026_0142.pdf` | An invoice | IBAN, phone, email, address, and a white line telling an AI to approve payment |
| `services_agreement.docx` | A short contract | A 1 pt white sentence about unlimited liability, plus a phone number and email |

Build them and run the terminal part:

    uv run python examples/demo/make_documents.py
    bash examples/demo/run_demo.sh

## Script (about 3 minutes)

Keep it to one idea per step. Say little; let the screen do the work.

**1. The CV (30 s).** Open `cv_ana_ferreira.pdf`. "This is a normal CV." Run
`complydoc audit examples/demo/documents/cv_ana_ferreira.pdf`. Show the line
`Hidden content 1 passage, 1 high`. Open `complydoc ui examples/demo/out-cv` and
show the passage that the eye could not see.

**2. Two loaders, two answers (30 s).** Same file, `--compare-extractor pypdf`.
Show that the loaders disagree on what the document says. The point is that
the text your pipeline reads is not the text a person reads.

**3. The folder (45 s).** `complydoc audit examples/demo/documents`. Three files,
seven identifiers, three hidden passages. Open `complydoc ui`.

**4. Safe copies (30 s).** `complydoc clean examples/demo/documents --out examples/demo/clean --rasterise --show`.
Open the copies: metadata gone, identifiers masked in the docx, and the PDFs have no
text layer left, so the hidden sentence cannot reach a model.

**5. Inside an assistant (45 s).** In Claude Code or Claude Desktop with the
complydoc MCP installed, ask: "Open `cv_ana_ferreira.pdf` and summarise the candidate."
Complydoc returns the text with the hidden instruction flagged, and the assistant tells
you instead of obeying it. Then: "Open `invoice_2026_0142.pdf`" and show the IBAN
and contact details masked.

## Notes

- Without `--rasterise`, `clean` masks identifiers in Word files but leaves a
  PDF's text layer as it was. Say this if asked; it is why the demo uses `--rasterise`.
- Person and organisation names are not scanned by default (the audit says so).
  Do not claim names are masked unless a name model is configured.
- Step 5 and the screen recording need the Mac with the MCP installed. Not done here.
