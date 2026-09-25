# Ignoring findings

Some findings are not a problem. Your company's own bank account is on every
invoice, and a test fixture plants a hidden instruction on purpose. The ignore
file records each of these once, with the reason, so later runs and
`complydoc check` stop counting them.

```bash
complydoc ignore id-8cba1a1a2d125912 --reason "Our own company name." \
  --file ./documents/.complydoc-ignore.yaml
```

Every identifier and every hidden or instruction-like passage in a report has a
`fingerprint`. Identifiers start with `id-` and passages with `ct-`. The
fingerprint stays the same across runs, machines and documents, so an ignore
written once applies wherever that finding appears. Fingerprints are in the
report JSON, and the viewer's **Ignore** button gives the command for each
finding. `--report` fills in a description from a report:

```bash
complydoc ignore id-8cba1a1a2d125912 --reason "Our own company name." \
  --report .complydoc/complydoc.json
```

## The file

```yaml title=".complydoc-ignore.yaml"
schema_version: 1
ignores:
  - finding: id-8cba1a1a2d125912
    reason: Our own company name.
    by: Duarte Cardoso
    what: Organisation name •••• •••••••s Ltd
    added: 2026-09-26
  - finding: ct-0993c42ecbfe26a0
    reason: A planted instruction the tests rely on.
    by: Duarte Cardoso
    paths: ["fixtures/*"]
    until: 2027-01-01
```

| Field | Meaning |
| --- | --- |
| `finding` | The fingerprint. Required. |
| `reason` | Why the finding is not a problem. Required, because an ignore with no reason is a finding nobody checked. |
| `by` | Who decided. `complydoc ignore` fills it in from git's `user.name`. |
| `what` | A description in words, so the file can be read without the report. |
| `paths` | Globs of relative paths. The entry applies only to documents that match. |
| `until` | The last day the entry applies. After it, the finding counts again and the report says the entry expired. |

A run reads `.complydoc-ignore.yaml` at the top of the folder it audits. Pass
`--ignore-file` to `audit` or `check` to read a different file. Discovery skips
hidden files, so the ignore file is never audited itself.

## What an ignore does

- The finding moves from `sensitive.matches` or `content_findings` into the
  document's `ignored` list, along with its reason. It stays in the report and
  the viewer lists it under **Ignored**.
- Every count, limitation, quick win and policy rule skips it, so
  `complydoc check` passes on it.
- The report adds a limitation saying how many findings were ignored, which
  entries expired, and which matched nothing.

`complydoc check --report old.json --ignore-file .complydoc-ignore.yaml` applies
the file to a report written before the file existed.

## From the viewer

When `complydoc ui` serves a report, each finding on the Security page has an
**Ignore** button. It asks for a reason and an optional end date, then writes
the ignore file in the audited folder. The change applies from the next run, and
the viewer marks the finding as ignored until then. A report opened any other way
shows the `complydoc ignore` command to copy instead.

The server accepts these writes only from its own page: same origin and a JSON
body. It writes only the ignore file.

## Commands

```bash
complydoc ignore --list                  # what is ignored, and what has expired
complydoc ignore id-… --remove           # count it again
complydoc ignore id-… -r "…" --until 2027-01-01 --path "invoices/*"
```

!!! note "A fingerprint is a hash, not a secret"
    The ignore file holds fingerprints and words, never a value. An identifier
    with few possible values, such as a six-digit sort code, can be recovered from
    its fingerprint by trying every value. Treat a fingerprint as no more private
    than the last digits a masked value shows.
