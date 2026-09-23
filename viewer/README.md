# complydoc viewer

A React viewer for complydoc's JSON report. It's a proof of concept, on its own
branch, for a richer way to read a large run than the single-file HTML report.
It reads the file in the browser and makes no network request.

```bash
npm install
npm run dev      # http://localhost:5173, then "Open the sample"
npm run check    # lint, types and tests
npm run build    # static files in dist/, which open from disk too
```

## Stack

React 19, TypeScript (strict), Vite, Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com)
on Radix, Lucide icons, Geist fonts, and Vitest with Testing Library.
[BRAND.md](BRAND.md) has the colours, type and rules.

## Folders

```
src/
  app/            the shell: App picks between opening a report and showing one
  features/       one folder per page, each owning its parts
    open/         the empty state: drop or choose a report, or open a sample
    summary/      readiness, quick wins, headline figures, caveats
    security/     what was found, what kind, where and how sure; hidden
                  instructions quoted; every finding, masked, in one table
    cost/         the cheapest model each way, the ten cheapest charted, every model
    documents/    every document; loaders/ for the loader comparison;
                  detail/ for one document: its page beside every reading, marked
  components/     complydoc's building blocks, made of shadcn parts: Section, Stat, DataTable...
    ui/           shadcn/ui source, added and updated with its CLI
  hooks/          useReportFile, useHashRoute, useTheme, useMediaQuery
  report/         the report itself, with no React: types, parsing, formatting,
                  selectors (select, security, cost), and readings.ts, which lines
                  up and diffs a page's readings
  lib/            shadcn's utilities
  fixtures/       the two sample reports, written by sample/make_reports.py
  test/           test setup and the sample loader
  index.css       the theme: brand tokens on shadcn's names
```

What goes where:

- **Rules go in `report/`.** Anything that decides something, such as which
  band a score falls in or which caveats the summary shows, is a plain function
  in `report/select.ts` with a test. Components only lay things out.
- **Components stay small.** Lint fails any file over 300 lines. Split before
  that.
- **Tests sit beside the code** (`Thing.tsx`, `Thing.test.tsx`) and query what
  a person sees (roles, names, text), not class names.
- **Imports use `@/`**, except for a sibling in the same folder.

## The samples

Six synthetic documents, 33 pages in all, in `sample/documents`: a two-column
contract, an annual report with tables and a chart, a staff handbook, scanned
invoices, a questionnaire hiding an instruction to a model, and German invoices.
Every identifier in them is invented or a published test value. From them come
the two reports the open screen offers: a full audit with page pictures, pypdf
compared and OCR, and pypdf against pdfplumber as LangChain loaders.

```bash
uv run python viewer/sample/make_documents.py
uv run python viewer/sample/make_reports.py
```

## The page comparison

Open a document from the Documents table (`#documents/<n>`). Each page shows
three resizable panes: the page itself, with every identifier found boxed
where it sits, and two readings, each chosen from every reader the run
compared (the kept extractor or loader, the others, and OCR), with what one
has and the other lacks marked.

The page picture needs a full report taken with page images:

```bash
complydoc audit ./docs --compare-extractor pypdf --ocr-compare --page-images --detail full
```

Without it, the readings still sit side by side and the page pane says how to get the picture.

## Adding a shadcn component

```bash
npx shadcn@latest add dialog
```

Files land in `src/components/ui`. They're ours to edit, as the Badge's
`success` and `warning` variants and the Toggle's green selected edge show, but keep changes small so the CLI can
still diff them.

## Opening a report

- **Choose or drop** the JSON that `complydoc audit --json` or
  `complydoc.write_json` wrote.
- **Embedded**: a page that carries `<script type="application/json"
  id="complydoc-report">` opens on it straight away. That's how a future
  `complydoc view report.json` could hand a report over.

The viewer reads report schema 15. It says so plainly when a file is some other
schema, or isn't a report.
