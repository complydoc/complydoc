# complydoc landing page

The page that introduces complydoc to AI engineers and researchers: a document
audit tool that shows the security, cost, time and content problems in their
documents and in what their loaders made of them. It is a static site on the
viewer's stack and theme (React, Tailwind v4, shadcn/ui), so the two look like
one product.

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # lint and types
npm run build    # static files in dist/
```

## The story, section by section

| Section | Says |
| --- | --- |
| Hero and tour | What complydoc is, and the viewer: Diff, Pages, Cost & time, Security |
| Providers | The loaders it reads the output of, and the model providers it prices |
| The problem | Teams commit to a loader blind; four measured costs of that |
| What it answers | Four questions, each answered with what complydoc reports |
| The page router | Every sample page, the route it needs and why, and what that saves |
| Integrations | LangChain, LlamaIndex, Docling, Unstructured, LlamaParse, Azure, pytest, CI |
| Models | Prices checked against each provider, and Jev from TypeSafe AI for hidden instructions |

## Where the content comes from

Nothing on the page is invented. The figures and output are from complydoc run
on the six sample documents in [`viewer/sample/documents`](../viewer/sample/documents):

| On the page | From |
| --- | --- |
| The problem's four figures | `complydoc audit`, `complydoc cost -m claude-sonnet-5 --monthly-volume 20000`, and `cd.compare_loaders` with LangChain's `PyPDFLoader` and `PDFPlumberLoader` |
| The section 7 answer | pdfplumber's reading of page 4 of `master-services-agreement.pdf`, as the audit fixture holds it |
| The page router and `src/data/routing.ts` | `complydoc routing ./documents`, the `complydoc-routing.json` it writes |
| The Jev table | [Detection accuracy](../docs/explanation/accuracy.md) |
| The verified models | `src/complydoc/config/pricing.yaml` |

When a release changes what these print, run them again and update the page.

## Screenshots

`src/assets/screens` holds screenshots of the viewer on the sample report:
`diff.webp`, `pages.webp`, `cost.webp` and `security.webp`, 16:10. Replace a
file with a new one of the same name to update the tour.

## Logos

`src/assets/logos` holds the marks of the loaders and model providers, from
[@lobehub/icons](https://github.com/lobehub/lobe-icons) (MIT) and Docling's own
repository (MIT). Each belongs to its company and is shown only to say that
complydoc works with it.

## The ASCII mark

`src/ascii.ts` is written by a script that draws the mark from the same
geometry as [`brand/logo`](../brand/logo/README.md):

```bash
python3 landing/scripts/make_ascii.py > landing/src/ascii.ts
```

On first paint the hero mark is read in, left to right, once. Readers who ask
for reduced motion see it still.

## Components

Everything is shadcn/ui, in `src/components/ui`, in the viewer's `radix-nova`
style. Tabs, ScrollArea, AspectRatio and ButtonGroup were taken from shadcn's
radix sources with the nova classes applied, as `npx shadcn add` does; run it
to bring them up to date. Code is highlighted with Shiki, loaded on demand with
only the Python, Bash and YAML grammars.

The viewer's [BRAND.md](../viewer/BRAND.md) applies: tokens, never raw colours;
lowercase complydoc; sentence case; no em dashes in our own copy.
