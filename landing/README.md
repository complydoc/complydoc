# complydoc landing page

The page that introduces complydoc to AI engineers and researchers:
observability for the pipeline that loads, cleans, splits, embeds and stores
their documents. It is a static site on the
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
| Hero | What complydoc is in a sentence, the install command, the command for a coding agent, and a trace |
| What to know first | Runs on your machine, network blocked, no account, MIT, and the loaders it works with |
| Quickstart | Install, wrap a pipeline in `cd.observe`, open the viewer |
| Features | One row a feature, text beside the thing itself: read, compare, expect, follow, protect, route |
| Measured | Four figures complydoc prints or its changelog records, each linked to where it is measured |
| For a team | The viewer shared from a container, and the policy gate |
| Integrations | LangChain, LlamaIndex, Docling, Unstructured, LlamaParse, Azure, pytest, CI |
| Questions | What a reader asks before installing: where documents go, overhead, loaders, accounts, cost |

## Where the content comes from

Nothing on the page is invented.

| On the page | From |
| --- | --- |
| The recordings in `src/assets/recordings` | The viewer with its sidebar folded, driven with a real mouse and rendered by `scripts/recordings/render.py`. `scenes.mjs` records Find a value, on the bundled sample documents observed twice with and without masking, and the diff, on `viewer/sample/documents/master-services-agreement.pdf` loaded with LangChain's `PyPDFLoader` and `PDFPlumberLoader` through `cd.compare_loaders`; `expect.mjs` records the evals. Recordings are kept for what has to be seen happening; each plays once it is on screen and stays a still picture for a reader who asked for less motion |
| The screenshots in `src/assets/screens` | From `scripts/recordings/shots.mjs`: the trace as a whole window, and one whole panel each for the reading of `employee-record.pdf` and for the Security page of `viewer/sample/documents` |
| The page router and `src/data/routing.ts` | `complydoc routing ./documents` on `viewer/sample/documents`, the `complydoc-routing.json` it writes |
| 98% of reported identifiers real | The changelog, 0.7.3: measured on 4,200 pages |
| 53 of 53, 91.4% precision | `complydoc benchmark` |
| The policy file | `docs/guides/policy.md` |
| The quickstart's pipeline | `docs/examples/observe_a_pipeline.py`, with the reader's own loader, splitter and store in place of the example's |

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

## Publishing

The landing page and the documentation share one GitHub Pages site, published
from `main` by `.github/workflows/docs.yml`: the landing page at
`https://complydoc.github.io/complydoc/`, the documentation under `docs/`.
`src/scripts/assemble_site.py` puts them together and leaves a redirect at every
address the documentation had before it moved.
