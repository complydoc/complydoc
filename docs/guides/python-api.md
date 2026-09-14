# Python API

## Conventions

Every entry point takes the same keywords where they apply:

| Keyword | Meaning | Default |
| --- | --- | --- |
| `config` | A `Config`, from `cd.load_config()` or `Config.override` | the shipped configuration |
| `reveal` | Include identifier values in full | `False` |
| `components` | `cost`, `readiness`, `sensitive` | all three |
| `models` | Model ids to price against | the configured comparison |
| `extracted_text` | Keep page text in the report | see below |
| `allow_network` | Let a loader reach the network | `False` |

`extracted_text` is off for `full_audit` and the other folder audits, because a
report of a large folder would carry every page. It is on for
`inspect_documents` and `compare_loaders`, whose purpose is to show the text.
`extract_text` runs OCR by default, because it returns text; the audits do not.

Every call runs inside the network guard and restores the socket module after.

## Strings

```python title="text_functions.py"
--8<-- "examples/text_functions.py"
```

| Function | Returns |
| --- | --- |
| `cd.scan_text(text)` | `TextScan`: `matches` and categories that could not be scanned |
| `cd.mask_text(text)` | `MaskedText`: the text with identifiers replaced, and counts |
| `cd.find_hidden(text)` | `ContentFinding`s: invisible characters and instruction-like passages |
| `cd.count_tokens(text, model)` | `TokenCount`: tokens, encoding and fidelity |

A string has no rendering, so `find_hidden` reports visibility as `not_measured`
except for characters that are invisible by definition.

## Configuration in code

`Config.override` returns a validated copy with settings replaced:

```python
config = cd.load_config().override({"readiness.signals.table_count.enabled": False})
```

Keys are dotted paths; use a tuple for names containing dots, such as
`("pricing", "models", "gpt-4.1", "enabled")`. Lists of models are indexed by `id`.
A missing final key is added, which is how new signals, categories and parser
prices are configured. An unknown path or an invalid value raises `ConfigError`.

## Extending

```python title="extend_complydoc.py"
--8<-- "examples/extend_complydoc.py"
```

- `cd.register_detector(detector)` adds a detector: an object with `id` and
  `find(text, context)` returning `cd.Finding` spans. A category uses it when its
  `detector` names that id.
- `cd.register_signal(signal)` adds a readiness signal: an object with `id`,
  `name`, `unit`, `why`, `applies_to` and `measure(document)` returning a
  `cd.Measurement`. It is measured unrated until `readiness.signals.<id>` is
  configured.

Registration applies to the current process. Audits with `jobs` above 1 run
documents in worker processes that do not have it.
