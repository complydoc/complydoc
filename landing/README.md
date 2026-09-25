# complydoc landing page

The page that introduces complydoc to the people who build with it: AI engineers
and researchers putting documents in front of a model. It is a static site on the
viewer's stack and theme, so the two look like one product.

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # lint and types
npm run build    # static files in dist/
```

## What is on it

Every figure and every line of output on the page came from running complydoc
on the six sample documents in [`viewer/sample/documents`](../viewer/sample/documents):

| Section | From |
| --- | --- |
| The terminal under the hero | `complydoc audit ./documents` |
| The four checks | the same run |
| The hidden instruction | `vendor-due-diligence.pdf`, page 2, and `cd.expect(report).no_hidden(severity="high")` |
| The loader table and similarities | `cd.compare_loaders` with LangChain's `PyPDFLoader` and `PDFPlumberLoader` |
| Routing | `complydoc routing ./documents` |

When a release changes what these print, run them again and update the numbers
in `src/sections`. Nothing on the page should be invented.

## The ASCII mark

`src/ascii.ts` is written by a script, which draws the mark from the same
geometry as [`brand/logo`](../brand/logo/README.md) and sets the wordmark in
figlet's standard font:

```bash
uv run --no-project --with pyfiglet python landing/scripts/make_ascii.py > landing/src/ascii.ts
```

On first paint the hero mark is read in, left to right, once. Readers who ask
for reduced motion see it still.

## Rules

The viewer's [BRAND.md](../viewer/BRAND.md) applies here too: tokens, never raw
colours; colour means a state; lowercase complydoc; sentence case; no em dashes
in our own copy (the terminal output quotes the CLI as it prints). The shadcn
components in `src/components/ui` are copies of the viewer's; `tabs.tsx` follows
shadcn's source.
