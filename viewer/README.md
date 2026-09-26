# complydoc viewer

A React viewer for complydoc's JSON report, and what `complydoc ui` serves: the
package carries it built, and opens it on every report in a folder. Opened any
other way, it reads the file in the browser and makes no network request.

```bash
npm install
npm run dev      # http://localhost:5173, then "Open the sample"
npm run dev:ui   # the same, on the reports a running `complydoc ui` serves
npm run check    # lint, types and tests
npm run build    # static files in dist/, which open from disk too
```

`npm run dev` opens reports from files, read only. To work on real reports with
saving (ignored findings, your concepts), start `complydoc ui` and point the dev
server at it; `dev:ui` expects port 8500, and `COMPLYDOC_UI` names another:

```bash
uv run complydoc ui ~/reports --no-browser        # http://127.0.0.1:8500
COMPLYDOC_UI=http://127.0.0.1:8518 npm run dev:ui
```

## Stack

React 19, TypeScript (strict), Vite, Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com)
on Radix, Lucide icons, Geist fonts, and Vitest with Testing Library.
[BRAND.md](BRAND.md) has the colours, type and rules.

## Folders

```
src/
  app/            the shell: App picks between opening a report and showing one;
                  ReportView is the sidebar, the breadcrumb bar and the page
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
  fixtures/       the sample reports, written by sample/make_reports.py
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
the three reports the open screen offers: a full audit with page pictures, pypdf
compared and OCR; pypdf against pdfplumber as LangChain loaders; and the same
documents filed into a shared drive, `finance/invoices/2026` and the like, audited
in one run as a folder is, with everything under it. The last is built into
`sample/share` when the reports are made, and not kept.

```bash
uv run python viewer/sample/make_documents.py
uv run python viewer/sample/make_reports.py
```

## The page comparison

Open a document from the Documents table (`#documents/<n>`), or a finding
from the Security page (`#documents/<n>/<page>/i<k>`), which opens on the
finding's page with it boxed on the picture, marked in both readings and
named in a banner above them. Each page shows
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
- **Served by `complydoc ui`**: the page it serves carries `<script
  type="application/json" id="complydoc-local">` saying where its list of
  reports is, and the viewer opens every one of them straight away
  (`src/hooks/useLocalReports.ts`). It asks nothing of any server but the one
  on this machine that served the page.
- **Embedded**: a page that carries `<script type="application/json"
  id="complydoc-report">` opens on it straight away.

## Built into the package

`make viewer-bundle`, at the root of the repository, builds the viewer into
`src/complydoc/viewer/dist`, where `complydoc ui` serves it from. It builds with
`VITE_SAMPLES=false`, which leaves the sample reports out: several megabytes a
user never needs, since `complydoc ui` opens their own. Release builds run it
before building the wheel.

The viewer reads report schemas 15 and 16. It says so plainly when a file is some other
schema, or isn't a report.
