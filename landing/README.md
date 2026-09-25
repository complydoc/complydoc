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
| The problem | Loaders get chosen without checking what they extract, on four counts |
| Questions | Four questions, each with a short answer and one example |
| The page router | Every sample page, the route it needs and why, and what that saves |
| Prompt injection | Hidden text revealed, the question complydoc asks a System One model, and the finding |
| Integrations | LangChain, LlamaIndex, Docling, Unstructured, LlamaParse, Azure, pytest, CI |

## Where the content comes from

Nothing on the page is invented. The examples and output are from complydoc run
on the six sample documents in [`viewer/sample/documents`](../viewer/sample/documents):

| On the page | From |
| --- | --- |
| The section 7 example | pdfplumber's reading of page 4 of `master-services-agreement.pdf`, as the audit fixture holds it |
| The page router and `src/data/routing.ts` | `complydoc routing ./documents`, the `complydoc-routing.json` it writes |
| The prompt injection demo | An oblique passage from `src/complydoc/benchmark/corpus.yaml` that no pattern matches. Jev's score is illustrative, within the range [Detection accuracy](../docs/explanation/accuracy.md) measured |
| The System One call | `src/complydoc/integrations/typesafe.py` |

When a release changes what these print, run them again and update the page.

## Screenshots

`src/assets/screens` holds screenshots of the viewer on the sample report:
`diff.webp`, `pages.webp`, `cost.webp` and `security.webp`, 16:10. Replace a
file with a new one of the same name to update the tour.

## Logos

`src/assets/logos` holds the marks of the loaders and model providers, from
[@lobehub/icons](https://github.com/lobehub/lobe-icons) (MIT), Docling's own
repository (MIT) and TypeSafe AI (drawn in `currentColor`). Each belongs to its company and is shown only to say that
complydoc works with it. The "K" in Kimi's mark is drawn in `currentColor`
rather than white, so it shows on the light theme too.

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
to bring them up to date. Commands and their output are shown as static text,
in the same frame as the code blocks.

Code is highlighted with Shiki, loaded on demand with only the Python, Bash and
YAML grammars. Its colours are CSS variables set from complydoc's tokens in
`src/index.css`, so code follows the brand and the light and dark themes.

The viewer's [BRAND.md](../viewer/BRAND.md) applies: tokens, never raw colours;
Geist and Geist Mono; lowercase complydoc; sentence case; no em dashes in our
own copy.
