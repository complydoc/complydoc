# Decision model

A pattern says what a run of characters looks like, and a name model what a word looks
like. The decision model, or judge, reads where a finding stands — the words before it on
its line, the paragraph around it, its shape — and says whether it is a person's
identifier, a business's, or not an identifier at all. A finding it reads as noise is
taken out of the report and left unmasked.

It is off by default, and it can only take away findings that rest on a shape:

- a value confirmed by its check digit (an IBAN, a NIF, a card number) is never judged;
- a category kept masked even with `--reveal` (API keys, tokens, private keys,
  passwords) is never judged;
- a business's identifier (a company's tax number, IBAN or switchboard) stays reported
  and masked unless the policy says `business: pass`;
- a judge model that cannot be read leaves every finding in place, and a warning says so.

## Turning it on

```yaml
sensitive:
  judge:
    enabled: true
    model: ~/models/judge.json
    threshold: 0.5      # drop a finding when the judge is at least this sure it is noise
    business: mask      # or pass, to let a company's identifiers through
```

The model is a small JSON file and runs with nothing installed, in well under a
millisecond per finding.

## Training one

Label findings from your own documents as `none`, `person` or `business`, one JSON line
each, with the page's text and the finding's offsets:

```json
{"text": "...", "category": "pt_nif", "start": 120, "end": 129, "evidence": "pattern", "label": "business"}
```

Then train, which needs scikit-learn:

```bash
uv run --with scikit-learn python src/scripts/train_judge.py findings.jsonl judge.json
```

On the synthetic benchmark of nine countries, a judge trained on invoices, payslips,
bank statements, contracts, HR files and CVs, and tested on other kinds of document,
took wrong flags from 5,631 to 90 at 0.9 points less recall. Those documents come from
one generator, so read that as an upper bound: a judge is only as good as the labelled
findings it learns from, and the ones from your own documents are worth most.
