# Policy files

`complydoc check` holds a folder to rules written in YAML, and exits non-zero when
it fails them. The rules are the checks [`cd.expect`](baselines-and-tests.md#assertions)
offers, so a policy file and a Python test ask the same questions.

```bash
complydoc check ./documents --policy policy.yaml
```

```yaml title="policy.yaml"
version: 1
rules:
  no_hidden:
    severity: medium
  no_identifiers:
    severity: high
  readiness_at_least:
    score: 60
  no_network: true
  all_categories_scanned:
    level: warning
  no_regressions:
    baseline: baseline.json
```

Every rule runs, so one run lists everything that failed rather than stopping at
the first. A rule with no parameters is written as `true`, and `false` switches one
off without deleting it.

## Rules

| Rule | Parameters | Fails when |
| --- | --- | --- |
| `no_identifiers` | `severity`, `evidence`, `categories` | An identifier in text or metadata matches the filters |
| `no_hidden` | `severity` (default `medium`) | A hidden or instruction-like passage is at or above it |
| `readiness_at_least` | `score` | A document scores below it |
| `global_score_at_least` | `score` | Global readiness is below it |
| `facts_found` | `facts`, `threshold` | A loader misses a fact |
| `no_network` | none | A loader attempted or made a connection |
| `no_failures` | none | A loader failed on a file, or a file was skipped |
| `all_categories_scanned` | none | An identifier category could not be scanned |
| `no_regressions` | `baseline`, `score_tolerance` | Anything got worse than the baseline |

`level: warning` on any rule reports it without failing the gate; the default is
`error`. Relative paths, such as a baseline, are resolved from the policy file's
own directory.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Every `error` rule passed. Warnings may still be reported |
| 1 | An `error` rule failed |
| 2 | The policy, the path or the report could not be read |

## Output for CI

```bash
complydoc check ./documents --policy policy.yaml \
  --markdown check.md --sarif check.sarif
```

`--markdown` writes a summary to post as a pull request comment: a table of every
rule and its result, then the failures under each rule that did not pass.
`--sarif` writes SARIF 2.1.0, which GitHub code scanning reads, with one result
per failure and the document it belongs to as its location.

To gate on a report that was already written, pass it instead of a path:

```bash
complydoc audit ./documents --out build --name current -q
complydoc check --report build/current.json --policy policy.yaml
```

## From Python

```python
import complydoc as cd
from complydoc.report.policy import check_policy, read_policy

report = cd.full_audit("./documents")
result = check_policy(report, read_policy("policy.yaml"))
print(result.passed, [rule.rule for rule in result.failed])
```

`cd.expect(report)` remains the way to write these checks inside a test suite; a
policy file is for the teams and pipelines that would rather not.
