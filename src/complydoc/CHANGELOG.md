# Changelog

Newest first. Releases increment the patch number; the minor number changes only for a
breaking change to the report JSON or a config key. `schema_version` in the JSON is
versioned separately.

## [0.4.9] — 2026-09-17

### Added

- `--classifier` on `audit`, `sensitive` and `check` registers an instruction classifier for
  the length of the command, so scoring passages no longer needs a Python script.
  `--classifier jev` is TypeSafe's hosted model and sends the passages it judges to
  api.typesafe.ai, which the command says before it runs and the report records;
  `--classifier module:function` calls code of your own. Two adjustments are made and
  announced rather than left as traps: the threshold becomes the 0.5 measured for Jev where
  none was given, and an automatic job count becomes one process, because a classifier
  registered in one process cannot follow documents into a worker.
  `--classifier-threshold` and `--jobs` override either.
- A report says where document text went. `run.content_sent_to` names every host a
  registered classifier sent passages to, an important limitation states it, and the CLI
  says so above the summary. An ordinary run leaves it empty, because nothing leaves the
  machine. Report schema 12.
- `run.classifier_missed_workers` counts documents a registered classifier could not be
  asked about, because they were read in worker processes where it does not exist. Running
  with `--jobs 1` puts every document in reach of it.
- The benchmark corpus holds ten passages labelled for hidden instructions: seven written
  at a model reading the document, in four languages and in wording that names no model at
  all, and three written to be mistaken for one — an AI-use policy, a contract clause, and
  a procedure addressed to staff. `complydoc benchmark` scores them, and `--verbose` names
  each missed injection with the score a registered classifier gave it. Measured numbers
  are on the Detection accuracy page.
- `complydoc.integrations.typesafe.jev_classifier` scores passages with TypeSafe's Jev and
  registers as an instruction classifier, so a passage phrased in a way no pattern covers is
  still reported. It is the only part of complydoc that sends document text off the machine:
  `allow_network=True` is required, the call is let through the network guard one call at a
  time and recorded, and everything else stays blocked. The optional extra is `typesafe`.
- `complydoc clean --show` lists what each copy changed and where it sat: a line in a text
  file, a cell in a spreadsheet, a slide, a header. Only the masked form is listed, because
  a copy exists so the values do not travel and printing them here would send them anyway.
  The same records are on `CleanResult.changes` for a caller.
- A sort code spaced rather than hyphenated, `12 34 56`, is found where its label is nearby.
  It sits with the context patterns rather than the plain ones, so three pairs of digits in
  open prose are still ignored.

### Changed

- `confirmed` now means a checksum passed, which is what it always claimed to mean. Five
  validators check a shape rather than compute a check digit — `sort_code`, `uk_postcode`,
  `uk_phone`, `plausible_dob` and `in_pan` — and a finding resting on one of those is
  reported as `corroborated` where its label sits beside it, and `pattern` where it does
  not. A contract start date beside the words "date of birth" was being reported as
  checksum-backed.

### Fixed

- `no_network()` and the `no_network` policy rule inspected loader connections only, so a
  run that sent every judged passage to a hosted classifier passed a gate asserting that
  nothing reached the network. They now fail on that too, naming the host.
- The documentation said the report schema was at 10 while it was at 12, and said the
  process makes no outbound connections without naming the classifier that does. Both are
  corrected, and the schema version in the docs is now checked by the test suite.

- The type check warned about two `type: ignore` comments that it needs. They sit on classes
  subclassing a base from an optional framework: installed, the base resolves and the ignore
  reads as unused; absent, the base is `Any` and subclassing it is the error the ignore
  suppresses. Both environments are real, so the comments stay and the warning does not.
- `complydoc doctor` said name detection was unavailable on an install where it works. It
  asked each detector for the models named on a category's first link, so the model doing
  the finding went unmentioned whenever it sat further down the chain. It now reports the
  model that answers, with the others listed under it.

## [0.4.8] — 2026-09-16

### Changed

- Names are read by `Babelscape/wikineural-multilingual-ner` where it is installed, and by
  `en_core_web_sm` where it is not. A category now names the detectors to try in order, so
  the better model is the default for anyone with the `multilingual-names` extra and a plain
  install keeps working unchanged. On the benchmark corpus the preferred model finds every
  name against two thirds, and on whole documents it reports 9 names to the English model's
  41, of which 9 were not names at all.

- `schema_version` is 11. `sensitive.models_used` records the detector and model that
  answered for each category, because two runs of the same documents read by different
  models should not produce reports that look identical. `load_report` still reads 5 to 11.

### Added

- The accuracy benchmark scores person and organisation names as their own group, against 15
  labelled names in seven languages. The published figures still cover the pattern-backed
  categories alone, so they say the same thing on every machine; a name score describes the
  model that is installed and is reported beside them. Detection accuracy carries the
  measured comparison of four models, including a multilingual one that finds every name in
  the corpus where the shipped English model finds two thirds.

- Three example documents in the fixtures, and in the folder `complydoc demo` audits: a
  Portuguese supplier contract, a German invoice and a French vendor assessment with an
  instruction to a model hidden in white text. Everything shipped before was English, which
  is not what these documents are.

- A `token_classifier` detector reads names with a local token-classification model, for the
  European languages the shipped English model does not. It is the recommended setting where
  names matter: measured against the benchmark corpus it finds every name where the shipped
  model finds two thirds, at better precision. `transformers` is an optional extra
  (`multilingual-names`) and the weights are read from files already on the machine, so a
  scan still reaches nothing. A page is cut into windows first, since the model reads a few
  hundred tokens at a time and a name past that point would otherwise be missed.

### Fixed

- The token classifier reached the network on its first load, and a scan's own guard then
  stopped it: every audit reported names as a category that could not be scanned. The
  offline switch is read by `huggingface_hub` as it is imported, so it is now set before the
  import rather than after it. The weights were always in the cache; what went to the hub
  was the tokenizer asking for its templates.

- A category pointed at a detector of the caller's own was scored as a pattern, which let a
  name model move the published numbers. A category is model-backed when it carries a model,
  whichever detector reads it.

## [0.4.7] — 2026-09-16

### Changed

- Report pages, chart tooltips and command line output separate values with commas and
  words rather than a middle dot.

### Added

- `complydoc clean` writes safe copies: text, Markdown, HTML, email, Word, Excel and
  PowerPoint files are copied with every identifier that was found replaced by its masked
  form, and the metadata parts removed. A PDF cannot have its text rewritten in place, so a
  PDF copy has its metadata stripped, and `--rasterise` renders each page to an image and
  rebuilds the file without a text layer. Black rectangles over live text are never drawn:
  the characters survive underneath one, where any reader can still select them.

- `complydoc benchmark` scores identifier detection against a labelled corpus that ships with
  the package, and the measured numbers are published in Detection accuracy. A finding counts
  as a hit when it overlaps a labelled value and names the same category, so the score
  measures the detectors rather than the resolver that picks between overlapping candidates.
  Categories backed by a model that is not installed are reported as unmeasured.

- A run that could not scan a category now says so where the count is read: the CLI summary
  names the categories nothing was looked for, and the report's Sensitive information page
  opens with them, above the findings. Without a name model installed a folder full of names
  reported zero of them, and only the limitations at the end of the report said why.

- Instruction patterns in Portuguese, Spanish, French, German, Italian and Dutch for the
  `role`, `addressed_to_model`, `conceal`, `steer_output` and `exfiltration` families, which
  matched English only. `languages` on a pattern records which languages its regexes were
  written for; every pattern still runs against every document, since an injected
  instruction can be in a language the document is not.

- A `table_fidelity` readiness signal: whether each ruled table's rows survive in the
  extracted text as rows. A row counts when its cells appear on one line, in order, matched
  as whole words. It describes the text the extractor this run used produced, not a verdict
  on extractors that were not used, and tables found by alignment are reported but not
  scored, since where their columns lie is a guess. Weight and thresholds are in
  `readiness.yaml` under `table_fidelity`.

- `complydoc check PATH --policy policy.yaml` holds documents to rules written in YAML: the
  checks `cd.expect` offers, named in a file. Every rule runs, so one run lists everything
  that failed. `level: warning` reports a rule without failing the gate. Exits 1 on a
  failure and 2 on a policy that will not load. `--markdown` writes a summary for a pull
  request comment and `--sarif` writes SARIF 2.1.0 for code scanning. `--report` checks a
  report JSON that was already written.

## [0.4.6] — 2026-09-16

### Added

- Page routing. Every page carries the extraction path it needs — its text layer, local OCR,
  or a vision model — with the reason, in `document.routing`. `report.routing` counts the
  pages per route and prices that mix against the three architectures the cost comparison
  already shows. `complydoc routing PATH` writes a manifest an ingestion job can read.
  Thresholds are in `readiness.yaml` under `routing`.

- `--timeout SECONDS` on `audit`, `compare`, `cost`, `readiness` and `sensitive`, and
  `timeout=` in the Python API. A document still being read when the time passes is stopped
  and listed as skipped with the reason `timed out`, and the report says so under
  limitations. A document can only be stopped by killing the process reading it, so a run
  with a timeout always uses a worker process, even with `--jobs 1`.

### Changed

- Report `schema_version` 10 adds `run.timeout_seconds`, `documents[].routing` and a
  top-level `routing` summary. `load_report` reads versions 5 to 10.
- Figures compared with each other in the report share one precision, so a routed mix and
  an all-vision total are read against each other rather than at different scales.
- `compare-loaders` shows each loader's framework and library in their own column, which no
  longer wraps the loader's name in a narrow terminal.

## [0.4.5] — 2026-09-15

### Added

- PowerPoint (`.pptx`), HTML (`.html`, `.htm`), Markdown (`.md`, `.markdown`), plain text
  (`.txt`) and email (`.eml`) documents. Slides are pages, with tables and speaker notes;
  HTML, Markdown and email are one logical page each. Email attachments are counted and not
  read.
- Hidden-content checks for the new formats: hidden slides, shapes outside the slide and tiny
  text in PowerPoint; hidden attributes, hiding styles and comments in HTML and email bodies;
  comments and hidden inline HTML in Markdown. HTML and Markdown passages are reported only
  when they read as instructions.
- Retrieval check: `inspect_chunks(..., questions=...)` and `compare_chunkers` rank the chunks
  for each question with BM25 and report whether the chunk holding its answer is retrieved
  within `top_k`, ranked lower, split across chunks or missing, with a hit rate and mean
  reciprocal rank per splitter. `complydoc chunks --questions questions.yaml --top-k N` and
  the chunks HTML page show the same. `cd.Question` and `cd.QuestionResult` are exported.
- Loaders are tagged with the framework and library they come from (`LangChain`, `LlamaIndex`,
  `Unstructured`, `Docling`, `LlamaParse`, `pypdf`, `pdfplumber` and others), and hosted parser
  presets with `hosted`. The tags appear beside each loader in the HTML report, the
  `compare-loaders` output and `report.to_pandas("loaders")`.

### Changed

- Report `schema_version` 8 adds `tags` to `report.loader` and to each loader in
  `loader_comparison`. `load_report` reads versions 5 to 8.
- `lxml` is a direct dependency. It was already installed with `python-docx`.
- The command line is a `complydoc.cli` package with a module per command group. The
  `complydoc` entry point and every command are unchanged; `--print-json` now routes progress
  to stderr per command instead of for the rest of the process.
- Broad exception handlers are narrowed where the failure types are documented (opening Word,
  Excel and PDF files, opening the report), and the ones kept broad say why.
- The logo, favicon and template setup shared by the HTML pages are in `complydoc.report.assets`.

## [0.4.4] — 2026-09-15

### Fixed

- `complydoc chunks` passes documents with `page_content` and `metadata` attributes, so
  LangChain text splitters accept them. 0.4.3 passed dictionaries, which they reject.

## [0.4.3] — 2026-09-15

### Added

- Identifiers beyond the UK: Italian codice fiscale, Belgian national register number,
  Polish PESEL, Swedish personnummer, Danish CPR, Swiss AHV, Brazilian CPF and CNPJ, Indian
  Aadhaar and PAN, Canadian SIN and Australian TFN, each with its check rule; international
  and North American phone numbers; US ZIP, Canadian, EU and Brazilian postal codes; street
  addresses in Portuguese, Spanish, Italian, French, German and Dutch; date-of-birth labels
  in ten languages and ISO dates.
- An identifier reference page generated from `sensitive.yaml`.
- `complydoc compare-loaders FILE` runs a loader comparison described in YAML: loaders as
  `module:attribute` or parser presets, paths, facts, `allow_network` and `cache_dir`.
- `complydoc chunks PATH --splitter "module:attribute key=value"` inspects the chunks one
  or more splitters make from a folder's text, and writes JSON and an HTML page.
- `complydoc diff OLD NEW` lists the changes between two report JSON files and exits 1 on a
  regression, for CI. `--out` writes JSON and an HTML page.
- `cd.write_chunks_html` and `cd.write_diff_html`.

### Changed

- Report `schema_version` 7 adds `run.documents_read_after_worker_failure`. `load_report`
  reads versions 5 to 7.

### Fixed

- When identifiers of equal length overlap, one found beside its own label wins.
- A worker process that stops during a parallel run no longer ends the run. The documents
  it had not returned are read in the main process, counted in
  `run.documents_read_after_worker_failure` and noted under limitations.

## [0.4.2] — 2026-09-15

### Added

- Name detection models are configurable per category: a spaCy package or a saved pipeline
  path, `by_language` models chosen from each page's detected language, `spans_key` to read
  scores from a span group and filter them with `min_confidence`, and `drop_short_acronyms`
  and `drop_multiline` to turn off the English-form filters.

### Changed

- `complydoc doctor` and `run.ner_available` check every configured name-detection model.
- Internal modules are grouped into `audit`, `loaders`, `extraction`, `report`, `pipeline` and
  `utils` packages. The public API (`import complydoc as cd`, `complydoc.integrations`) is
  unchanged; code importing internal module paths needs the new paths.

## [0.4.1] — 2026-09-14

### Added

- `cd.scan_text`, `cd.mask_text`, `cd.find_hidden` and `cd.count_tokens` work on plain strings.
- `Config.override` returns a validated copy of a configuration with settings replaced.
- `cd.register_signal` and `cd.register_detector` add readiness signals and identifier
  detectors. `Detector`, `DetectorContext`, `Finding`, `Signal` and `Measurement` are exported.
- `cd.load_report` reads a report back from its JSON.
- `cd.diff_reports(old, new)` lists changes between two reports and which of them are worse.
- `cd.expect(report)` chains assertions for tests and CI, raising `cd.ExpectationError`.
- `cd.inspect_chunks` and `cd.compare_chunkers` report on text splitter output: token
  statistics, cut sentences and tables, headings left at a chunk end, duplicates, identifiers
  repeated across chunks, and expected facts split across chunks.
- `cd.iter_audit` and `cd.aiter_audit` yield each document's report entry as it is read.
- `compare_loaders(..., cache_dir=...)` caches loader output per file.
- Pipeline steps `cd.MaskIdentifiers`, `cd.DropHiddenPassages` and `cd.StripPathMetadata`,
  with adapters in `complydoc.integrations.langchain` and `complydoc.integrations.llamaindex`.

### Changed

- `schema_version` is 6: `cached_files` on each loader. `load_report` reads versions 5 and 6.
- The Python API reference is grouped by task.
- An existing report test no longer depends on test order for the network guard.

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

[Unreleased]: https://github.com/complydoc/complydoc/compare/v0.4.6...HEAD
[0.4.6]: https://github.com/complydoc/complydoc/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/complydoc/complydoc/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/complydoc/complydoc/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/complydoc/complydoc/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/complydoc/complydoc/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/complydoc/complydoc/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/complydoc/complydoc/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/complydoc/complydoc/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/complydoc/complydoc/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/complydoc/complydoc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/complydoc/complydoc/releases/tag/v0.1.0
