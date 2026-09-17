# Contributing

## Setup

```bash
make install-all   # dependencies, optional extras and the spaCy model
make check         # lint, types and tests, as CI runs them
make               # list every target
```

`make tool` installs the working tree as the global `complydoc`, with `--force --reinstall`
so uv rebuilds the wheel even when the version is unchanged. Re-run it after each change you
want on your PATH. It also reinstalls the spaCy model and runs `complydoc doctor`.

## Layout

| Path | Contents |
| --- | --- |
| `src/complydoc/api.py`, `cli/` | The Python API, and the command line with a module per command group |
| `src/complydoc/offline.py` | Network guard |
| `src/complydoc/audit/` | Running an audit: discovery, sampling, worker processes, report assembly |
| `src/complydoc/ingest/` | Per-format readers behind the `Loader` protocol, extractors and OCR engines |
| `src/complydoc/readiness/signals/` | One file per signal, registered by decorator |
| `src/complydoc/sensitive/` | Detectors, validators, masking and the identifier scan |
| `src/complydoc/hidden/` | Hidden content and instruction checks |
| `src/complydoc/cost/` | Tokenizers, vision formulas, price catalogue |
| `src/complydoc/loaders/` | Other frameworks' loaders: inspection, comparison, parser presets, cache |
| `src/complydoc/extraction/` | Masked text extraction, string functions, expected facts, chunk inspection |
| `src/complydoc/report/` | Report models, JSON and HTML, scores, quick wins, tables, diffs, expectations |
| `src/complydoc/pipeline/`, `integrations/` | Pipeline steps and framework adapters |
| `src/complydoc/utils/` | General helpers: text, geometry, DataFrames |
| `src/complydoc/ui/` | Report template, stylesheet and script |
| `src/complydoc/config/` | YAML configuration |
| `src/tests/` | Tests and fixtures; `integration/` needs the `integrations` group |
| `src/scripts/` | Maintenance scripts, not shipped |
| `docs/` | Documentation site |

Documents go through discovery and a loader into the `Document` model; every component reads
that model. Cost, readiness and the sensitive scan are independent.

`offline.py` replaces the outbound socket and DNS entry points before any file is opened.
`src/tests/test_offline_guard.py` runs a full audit with the guard armed.

## Documentation

`make docs` serves the site at `localhost:8000`; `make docs-build` builds it with `--strict`.

`docs/reference/` is generated at build time from the Typer app, the docstrings,
`report_shape()` and the configuration models. Guides include examples from `docs/examples`,
which `src/tests/test_docs.py` executes.

## Sample documents

`src/complydoc/sample` holds the seven synthetic documents used by `complydoc demo`. They are
copies of fixtures in `src/tests/fixtures`; `make sample` refreshes them. Every name and
identifier in them is invented.

## Adding a signal

Add a file under `readiness/signals/` with an `@signal` class, and a block in
`readiness.yaml`. Signals are discovered at import. Detectors use `@detector`; loaders use
`register`.

```python
@signal
class ScanDpiSignal:
    id = "scan_dpi"
    name = "Scan resolution"
    unit = "DPI"
    why = "Below about 200 DPI, OCR starts confusing digits in amounts and accounts."
    applies_to = frozenset({DocumentFormat.PDF, DocumentFormat.IMAGE})

    def measure(self, document: Document) -> Measurement: ...
```

Return `Measurement.na(reason)` when the property cannot be measured.

## Tests and fixtures

```bash
make test
make fixtures   # rebuild fixtures from src/tests/generate_fixtures.py
```

Fixtures are committed; CI checks the generator still produces all of them. Identifiers in the
PII fixture are test values: a published test card number, the ISO 13616 example IBAN, an
Ofcom drama-range phone number, and invented names.

- Assert on behaviour. CLI help text and Rich tables wrap differently in CI.
- Calibrate thresholds on real pages.

## Maintenance scripts

| Script | Target | Purpose |
| --- | --- | --- |
| `build_price_table.py` | `make prices` | Refresh the vendored model catalogue |
| `build_sbom.py` | `make sbom` | CycloneDX SBOM from the lockfile |
| `build_diagram.py` | `make diagrams` | Rebuild the architecture diagram |

Entries written by `make prices` are marked `imported`. To mark one verified, check it at the
source and replace `price_source`/`imported_on` with `last_verified`.

## Branches and releases

Work lands on `development`; `main` receives fast-forward merges for releases. Both run the
full check suite.

Releases increment the patch number. The minor number changes
only for a breaking change to the report JSON or a config key. `schema_version` in the
report JSON is versioned separately and moves whenever the JSON shape changes.

```bash
make release-check
git tag -a "v$VERSION" -m "complydoc v$VERSION"
git push origin "v$VERSION"
```

The tag must match `complydoc.__version__` and have a changelog entry. `release.yml` builds the
wheel and sdist, an SBOM and checksums, attests the artefacts, and drafts a release:

```bash
gh attestation verify complydoc-$VERSION-py3-none-any.whl --repo complydoc/complydoc
```

Publishing the draft runs `publish.yml`, which uploads the attached artefacts to PyPI through
Trusted Publishing (owner `complydoc`, repository `complydoc`, workflow
`publish.yml`, environment `pypi`). `workflow_dispatch` with a tag re-runs a partial upload and
skips files already present.
