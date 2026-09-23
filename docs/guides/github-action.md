# GitHub Action

The repository is also a GitHub Action. It runs [`complydoc check`](policy.md)
on a pull request, writes the result to the job summary, keeps one comment on the
pull request up to date, and can send the failures to code scanning.

```yaml title=".github/workflows/documents.yml"
name: documents

on:
  pull_request:
    paths: ["documents/**", "policy.yaml"]

permissions:
  contents: read
  pull-requests: write     # the comment
  security-events: write   # only with sarif: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: complydoc/complydoc@v0.5.0
        with:
          path: documents
          policy: policy.yaml
          sarif: true
```

A policy to start from:

```yaml title="policy.yaml"
version: 1
rules:
  no_hidden:
    severity: medium
  no_identifiers:
    severity: high
  no_failures: true
  all_categories_scanned:
    level: warning
```

## Inputs

| Input | Default | |
| --- | --- | --- |
| `policy` | required | The [policy file](policy.md) |
| `path` | `.` | File or folder to check, from the repository root |
| `version` | the tag | complydoc to install. Empty installs the version in the tag the action was used at (`@v0.5.0` installs 0.5.0), or the latest release for any other ref |
| `extras` | `ocr` | Optional extras, comma separated. `multilingual-names` finds names in European languages and is a large download |
| `args` | | More arguments for `complydoc check`, such as `--timeout 120` |
| `comment` | `true` | Keep one comment on the pull request with the result |
| `sarif` | `false` | Upload the failures to code scanning |
| `fail` | `true` | Fail the job when an `error` rule fails |
| `upload-report` | `false` | Upload the HTML and JSON reports as an artifact |
| `token` | `github.token` | Token for the comment |

## Outputs

| Output | |
| --- | --- |
| `passed` | `true` when every `error` rule passed |
| `exit-code` | `0` passed, `1` a rule failed, `2` the policy or path could not be read |
| `markdown` | Path to the summary |
| `sarif` | Path to the SARIF file |

## What leaves the runner

Installing complydoc reaches PyPI. After that the check runs with the network
guard armed, so the documents are read on the runner and nothing is sent anywhere
unless `args` passes `--classifier`.

What the action publishes is the policy result: rule names, document paths and
pages, and identifiers in their masked form. A hidden passage is quoted in the
summary, cut short, because the passage is the finding. The reports uploaded by
`upload-report` hold masked findings and no page text, but anyone who can read
the workflow run can download them.

## Names

The default `extras` finds no person or organisation names: that needs a model,
and a plain install has none. Either keep `all_categories_scanned` at
`level: warning`, so the gap is reported rather than silently ignored, or fetch
the model before the check. The weights go to the Hugging Face cache, which the
check reads from:

```yaml
      - uses: astral-sh/setup-uv@v6
      - uses: actions/cache@v4
        with:
          path: ~/.cache/huggingface
          key: hf-wikineural-multilingual-ner
      - run: >-
          uv run --no-project --with transformers --with torch python -c
          "from transformers import pipeline;
          pipeline('token-classification', model='Babelscape/wikineural-multilingual-ner')"
      - uses: complydoc/complydoc@v0.5.0
        with:
          path: documents
          policy: policy.yaml
          extras: ocr,multilingual-names
```

## Forks

A pull request from a fork gets a read-only token, so the comment cannot be
written. The step is allowed to fail, and the result is still on the job summary.
