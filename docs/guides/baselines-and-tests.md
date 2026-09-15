# Baselines and tests

A report written with `cd.write_json` can be read back, compared with a later
report, and checked with assertions in a test suite or CI.

```python title="baseline_and_expect.py"
--8<-- "examples/baseline_and_expect.py"
```

## Reading a report

`cd.load_report(path)` returns the same `AuditReport` the run produced. It also
accepts the parsed JSON as a dictionary. It reads `schema_version` 5, 6 and 7; fields
added since a report was written take their defaults. Any other version raises
`ValueError`.

## Comparing reports

`cd.diff_reports(old, new)` returns a `ReportDiff`. Documents are matched by
relative path. Each `Change` has an `area`, a `kind` (`added`, `removed` or
`changed`), the document, a subject, the values before and after, and `worse`.

| Area | Worse when |
| --- | --- |
| `documents` | A document is missing |
| `identifiers`, `metadata` | An identifier appears |
| `hidden` | A hidden or instruction-like passage appears |
| `readiness`, `global` | A score falls by at least `score_tolerance` (0.5) |
| `signals` | A signal's rating falls |
| `similarity` | A loader's text similarity to the baseline loader falls by 0.01 or more |
| `facts` | A loader no longer finds a fact |
| `loaders` | Network attempts or failed files increase |
| `limitations` | An important limitation appears |

`changes.regressions` and `changes.improvements` split the changes;
`changes.summary()` prints one line each, and `changes.to_pandas()` returns a
table. `cd.write_diff_html(changes, path)` writes them as an HTML page.

## In CI

```bash
complydoc audit ./documents --out build --name current -q
complydoc diff baseline.json build/current.json --out build
```

`complydoc diff OLD NEW` prints each change and exits with status 1 when there is
a regression, 2 when either file cannot be read, and 0 otherwise.
`--no-fail-on-regression` always exits 0 for readable files. `--tolerance` sets
`score_tolerance`. `--out` also writes `complydoc-diff.json` and
`complydoc-diff.html`; `--print-json` writes the JSON to stdout.

## Assertions

`cd.expect(report)` starts a chain of checks. A failed check raises
`cd.ExpectationError`, a subclass of `AssertionError`, listing up to 20 items that
failed it.

| Check | Fails when |
| --- | --- |
| `no_identifiers(severity=, evidence=, categories=)` | An identifier in text or metadata matches the filters |
| `no_hidden(severity="medium")` | A hidden or instruction-like passage is at or above the severity |
| `readiness_at_least(score)` | A document scores below `score` |
| `global_score_at_least(score)` | Global readiness is below `score` |
| `facts_found(facts=None)` | A loader misses a fact; without `facts`, uses a comparison's facts |
| `no_network()` | A loader attempted or made a connection |
| `no_failures()` | A loader failed on a file, or a file was skipped |
| `all_categories_scanned()` | An identifier category could not be scanned |
| `no_regressions(baseline)` | `diff_reports(baseline, report)` has a regression |
