# Changelog

Newest first. Releases increment the patch number; the minor number changes only for a
breaking change to the report JSON or a config key. `schema_version` in the JSON is
versioned separately.

## [Unreleased]

### Added

- `cd.scan_text`, `cd.mask_text`, `cd.find_hidden` and `cd.count_tokens` work on plain strings.
- `Config.override` returns a validated copy of a configuration with settings replaced.
- `cd.register_signal` and `cd.register_detector` add readiness signals and identifier
  detectors. `Detector`, `DetectorContext`, `Finding`, `Signal` and `Measurement` are exported.

## [0.4.0] — 2026-09-14

### Added

- `report.to_pandas(table)` returns a report table as a DataFrame (`notebook` extra), and a
  report renders as a summary in Jupyter. Tables: documents, pages, identifiers, signals,
  hidden, metadata, limitations, quick_wins, loaders, differences.
- Readiness signals measured on text alone, so they also apply to loader output:
  `unmapped_glyphs` (`(cid:N)` codes, private-use and control characters),
  `hyphenated_line_breaks` and `repeated_page_lines` (running headers and footers).
- `vendor-assessment.pdf` in the demo samples carries an instruction in white text.
- `compare_loaders(..., paths=...)` runs each loader once per file in a folder or list of
  files, taking loader classes or callables, and records files a loader failed on.
- Expected facts: `cd.check_facts(report, facts)` and `compare_loaders(..., facts=...)`
  check whether passages you expect appear in each loader's text, as exact or fuzzy matches.
- `complydoc.parsers` presets for Docling, Unstructured, LlamaParse and Azure Document
  Intelligence. Hosted presets need `allow_network=True`; per-page prices are under
  `parsers` in `pricing.yaml` and a comparison reports each parser's estimated cost.

### Changed

- `schema_version` is 5: `loader_comparison.facts`, and per loader `failures`, `facts_found`
  and `parser_usd`.
- `pricing.yaml` has a `parsers` section.
- The demo audits seven sample documents.

## [0.3.1] — 2026-09-14

### Added

- Hidden content and prompt injection checks in the security scan:
  - PDF: each character in the text layer is checked for ink under it on the rendered page.
  - Word and Excel: hidden formatting, white or tiny text, hidden sheets, rows and columns.
  - Any text: Unicode tag characters, zero-width runs and bidirectional overrides.
  - Instruction patterns in the new `hidden.yaml`; `cd.register_instruction_classifier()`
    adds a local classifier.
  - Each passage has a visibility level and an instruction level, shown as a matrix on the
    Security page. See `docs/explanation/hidden-content.md`.
- `cd.inspect_documents()` runs the audit on the output of a LangChain or LlamaIndex loader,
  a callable, or loaded documents, and reports the metadata on each document and the network
  connections the loader attempted.
- `cd.compare_loaders()` runs several loaders on the same input and reports text similarity,
  identifiers found by some loaders only, and metadata keys and documents not returned by all.
- `inspect_documents(..., allow_network=True)` lets the loader call connect. Connections are
  recorded and the report states that network access was allowed.
- Metadata values are scanned for identifiers (`document.metadata_findings`) and absolute file
  paths (`document.path_exposures`).
- `offline.guarded()` yields the connections it refused.
- `cd.extract_text()` returns a folder's text with identifiers masked, in chunks with token
  counts, and warnings for anything that could not be read or scanned.
- `register_loader`, `register_extractor` and `register_engine`, with the types a plug-in needs
  (`Document`, `Page`, `Rect`, `IngestOptions`). `DocumentFormat.OTHER` for unknown formats.
- A Python API: `cd.full_audit`, `cd.security_audit`, `cd.cost_audit`, `cd.readiness_audit`,
  `cd.write_html`, `cd.write_json`. `complydoc.__all__` defines the public surface.
- Documentation site on GitHub Pages. Reference pages are generated from the code, and guide
  examples are executed by the test suite. `make docs` and `make docs-build`.

### Changed

- The report template, stylesheet and script are in `complydoc/ui`.
- Tests are in `src/tests` (LangChain tests in `src/tests/integration`) and maintenance scripts
  in `src/scripts`. Neither is in the wheel.
- The package ships `py.typed`.
- Page text has a `loader` source. Signals that need page geometry report as not measured on it.
- `schema_version` is 4: `loader`, `loader_comparison`, and per document `metadata_findings`,
  `path_exposures`, `content_findings` and `visibility_checked`.
- `complydoc schema` reads the report shape from `report_shape()` in `report/models.py`.
- `offline.guarded()` arms the network guard for a block and restores the socket module after.
  The library entry points use it.
- A library call on a missing path raises `FileNotFoundError`.
- The README installs from PyPI.

### Fixed

- The HTML report did not escape values, so document text, file names and metadata could inject
  markup. Autoescaping is now on for the template.
- Numbers passing Luhn (such as a PDF `CreationDate`) were reported as card numbers. Card numbers
  must also match an issuer prefix and length.
- The entity model is no longer preloaded in the process workers fork from, which could crash
  pypdfium2 in a worker on macOS.
- An overlapping weaker finding could unmask part of a confirmed one. Masking now applies the
  strongest evidence first and never overwrites masked characters.

## [0.3.0] — 2026-09-10

### Added

- PyPI publishing through Trusted Publishing, triggered by publishing a drafted release.
- PyPI metadata: classifiers and project links. README images use absolute URLs.
- `complydoc demo` audits six bundled synthetic documents.
- Global readiness score combining content, cost path and exposure, with weights in
  `readiness.yaml`. Unmeasured factors are dropped and the rest renormalised.
- The front-page ring shows how many documents fall in each band.
- Quick wins, ranked by the number of documents affected, each naming its documents and who acts.
- Evidence tiers on sensitive findings: `confirmed`, `corroborated`, `pattern`, `model`.

### Changed

- Cost moved from the front page to the Cost tab.
- The NER detector reports `confidence` as null; `min_confidence` for names and organisations
  was removed.
- `schema_version` is 3: `overall`, `quick_wins`, `evidence` on matches; `confidence` may be null.
- The summary prices against `compare.headline_model` (Claude Sonnet 5 by default), falling back
  to the cheapest priced model.
- Models named by their id use the catalogue's display name.
- Architecture reach is shown once per architecture in the chart legend.
- A sensitive mark has one tooltip, carries an `aria-label`, and shows the masked value.
- Summary tiles no longer repeat the chart heading.

### Fixed

- `.complydoc` is git-ignored.

### Performance

- Memory for a 392-page book: 2.1 GB to 0.99 GB, by releasing pdfplumber page caches.
- The coverage helper is fourteen times faster, using `min`/`max` in place of `np.clip`.

### Internal

- Type suppressions reduced from twenty to four.
- One shared severity table.
- Dead code removed.

## [0.2.0] — 2026-09-10

### Added

- `complydoc compare` runs an audit with every installed extractor and OCR engine.
- Pluggable extractors: `--extractor`, `--compare-extractor`, `complydoc extractors`. Only the
  first extractor's reading produces findings.
- pdfium extractor: agrees with pdfplumber within 1–2% on a 392-page book and is about thirteen
  times faster. No table structure; one box per line.
- pypdf extractor: text only, no geometry.
- Pluggable OCR engines: `--ocr-engine`, `--compare-ocr-engine`, `complydoc engines`. Tesseract
  support.
- The page viewer marks words found by only one reader, and can jump to the next page where
  readers differ.
- The report distinguishes a reader that returned the same words in a different order from one
  that read different words.
- Progress bar, count and elapsed time while reading a folder.
- Vendored model catalogue from models.dev, `complydoc models --new N`, and `make prices`.
  Imported prices are marked as imported. Batch prices from litellm.
- The comparison covers three models per provider (`compare.per_provider`).
- Batch pricing where the provider publishes it.
- `--save-text <dir>` writes the extracted text, one file per document.
- Timing by stage, with projections for 100 to 100,000 documents.

### Changed

- The difficulty component is renamed readiness (`complydoc readiness`, `readiness.yaml`,
  `schema_version` 2). Bands: ready, workable, needs work, not ready.
- The Documents page is a page viewer: every page, with the page beside its text.
- Readiness tables moved to each document's Signals tab.
- Extracted text is included in the report by default; `--no-extracted-text` removes it.
- Sensitive marks on the page layout explain the finding on hover.
- Readings are compared by word, ignoring whitespace.
- The report uses the full window width.
- Security findings are sorted by severity; every column is sortable.
- The page heading was removed; run details are in the footer.
- The document panels have a fixed height.
- `complydoc pricing-import` reads the vendored table and marks entries as imported.

### Performance

A folder of 102 documents: 17.6s to 10.9s with OCR, 7.4s to 2.9s without. A 392-page book:
56.9s to 31.0s.

- Skew is measured by projecting ink pixels, coarse then fine.
- The entity model loads only the named-entity component and parses each page once.
- The whitespace table pass applies the geometric test before extracting text.
- Workers fork from a server with models loaded; worker count follows folder size.

### Fixed

- Two extractors reading a page in different orders are reported as disagreeing.
- Sensitive marks respond to the pointer across their whole area and can be focused.
- DOCX merged cells are counted from the markup.
- The OCR engine registers its shutdown cleanup when it starts, fixing a mutex error at exit.
- The file list aligns correctly when the Signals tab is shown.
- Imported prices no longer produce staleness warnings.

### Documentation

- CONTRIBUTING.md holds architecture, signals, fixtures and releases. The changelog ships in
  the package.

## [0.1.0]

First release.

- Cost, extraction readiness and sensitive data components, run together or separately.
- Cost from page geometry and a tokenizer, across text, OCR and vision paths. Prices in
  `pricing.yaml` with `last_verified`; prices older than 90 days are flagged as stale.
- Nineteen readiness signals, with weights and thresholds in configuration.
- Identifiers for the UK, US, IE, NL, PT, ES, FR and DE, EU VAT, IBAN, payment cards, and local
  NER for names and organisations.
- Per-document timing and backlog projections.
- Network guard armed before any document is opened, in every process; recorded in
  `run.offline_guard`.
- Values masked to the last four characters; `--reveal` shows them and is recorded;
  `never_reveal` categories stay masked.
- Self-contained HTML report, JSON report, `--print-json`.
- Generated limitations section.
- `complydoc` audits the current directory; `--jobs`, `--sample`, `--password`.
- Packaged agent skill.

[Unreleased]: https://github.com/duartecaldascardoso/complydoc/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/duartecaldascardoso/complydoc/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/duartecaldascardoso/complydoc/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/duartecaldascardoso/complydoc/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/duartecaldascardoso/complydoc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/duartecaldascardoso/complydoc/releases/tag/v0.1.0
