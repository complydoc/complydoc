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
    open/         the empty state: drop, choose or open the sample
    summary/      readiness, quick wins, headline figures, caveats
    security/     identifiers by severity, by kind, and where
    documents/    every document, and loaders/ for the loader comparison
  components/     complydoc's building blocks: Section, Stat, DataTable, ScoreRing...
    ui/           shadcn/ui source, added and updated with its CLI
  hooks/          useReportFile, useHashTab, useTheme
  report/         the report itself, with no React: types, parsing, formatting, selectors
  lib/            shadcn's utilities
  fixtures/       a real report: pypdf against pdfplumber over the sample folder
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

## Adding a shadcn component

```bash
npx shadcn@latest add dialog
```

Files land in `src/components/ui`. They're ours to edit, as the Badge's
`success` and `warning` variants show, but keep changes small so the CLI can
still diff them.

## Opening a report

- **Choose or drop** the JSON that `complydoc audit --json` or
  `complydoc.write_json` wrote.
- **Embedded**: a page that carries `<script type="application/json"
  id="complydoc-report">` opens on it straight away. That's how a future
  `complydoc view report.json` could hand a report over.

The viewer reads report schema 15. It says so plainly when a file is some other
schema, or isn't a report.
