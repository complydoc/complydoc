# complydoc brand guidelines

How complydoc looks and sounds, in the viewer and anywhere else it shows up.
The tokens live in [`src/index.css`](src/index.css), on shadcn/ui's names, so
every component picks them up without being told.

## Principles

1. **Calm.** The report is read by someone deciding what to do about their
   documents. Nothing blinks, nothing shouts, and colour means something.
2. **Short labels over paragraphs.** A heading and a number say more than a
   sentence explaining them. If a section needs a paragraph to be understood,
   the section is wrong.
3. **Clearly separated.** One idea per section, a separator between sections,
   one heading each.
4. **Evidence first.** Show what was found and where. Opinions, such as a
   recommended loader, come with the reason next to them.

## Name and mark

- The name is always lowercase: **complydoc**, even at the start of a sentence.
- The mark is a check mark whose two strokes are leaves, with a dot above the
  short one: complydoc's answer about a document. It is built from flat pieces
  with even gaps, as LangChain's mark is, so the two sit well together.
- Use [`Logo`](src/components/Logo.tsx) in the app. The source files, and where
  each version goes, are in [`brand/logo`](../brand/logo/README.md).
- In the UI the mark is one colour, the primary green, with no plate behind it.
  Don't recolour it, stretch it or outline it.

## Colour

Colour carries state. A colour that doesn't mean anything is grey.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#fbfbfa` | `#000000` | The page ("paper"); in dark, the sidebar too |
| `card` | `#ffffff` | `#0d0e0f` | Cards, tables, panels |
| `foreground` | `#111111` | `#e9e9e7` | Body text ("ink") |
| `muted-foreground` | `#666666` | `#9aa0a6` | Labels, secondary text |
| `faint` | `#999999` | `#71767b` | Footnotes, weights, the least important text |
| `border` | `#e8e8e6` | `#222427` | Card edges, table rules, separators |
| `primary` | `#a3dcf1` | `#a3dcf1` | **complydoc baby blue.** Main action fill (navy text on it), focus ring |
| `primary-soft` / `primary-ink` | `#dcf1f9` / `#1d6f96` | `#102a35` / `#a3dcf1` | A blue tint behind something; blue text and links |
| `viz-blue` | `#56b4e0` | `#a3dcf1` | The mark, readiness, loading and documents |
| `viz-indigo` · `viz-violet` · `viz-mint` · `viz-amber` · `viz-coral` | `#6b7cf0` · `#9a7cf4` · `#2bb38a` · `#e6a23c` · `#ee6b5f` | `#9aa6f7` · `#bba7fb` · `#6ad9b6` · `#f2c26b` · `#f6998e` | Charts and kinds of work: one hue a series |
| `success` / `success-soft` | `#1f9470` / `#e2f5ee` | `#6ad9b6` / `#11302a` | Ready, kept, recommended |
| `warning` / `warning-soft` | `#b7791f` / `#fbf0dc` | `#f2c26b` / `#35291a` | Needs work, close, medium severity |
| `destructive` / `destructive-soft` | `#c8473b` / `#fbe7e4` | `#f6998e` / `#3a2220` | Not ready, missed, high severity |
| `secondary` / `muted` | `#f1f1ef` | `#18191b` | Neutral badges, quiet fills |

Rules:

- Use the token, never the hex value: `text-muted-foreground`, not `text-[#666]`.
- State colours go on a soft fill, as in a badge, not on large areas.
- Baby blue is the brand, and it is used sparingly: the mark, the main action,
  the active page's icon, the readiness ring, focus. It is not a status.
- The six `viz` hues are one family. Charts and kinds of work take one each, so
  the app has colour without colour meaning good or bad; status keeps mint,
  amber and coral.
- The attention red is a coral, not a fire engine. It says "look here", not "danger".
- Dark mode is black, not grey: the page and the sidebar are one black surface,
  cards sit a step above it. It is its own palette, not an inversion. Don't
  write `dark:` overrides; the tokens already switch.

## Typography

- **Geist** for everything, **Geist Mono** for code, file keys and quoted
  document text. Both are bundled with the viewer, never fetched.
- Figures use tabular numbers (set on `body`), so columns of digits line up.
- Sizes, from the Tailwind scale:

| Role | Class |
| --- | --- |
| Headline figure | `text-3xl` to `text-4xl`, semibold, tight tracking |
| Section heading | `text-lg`, semibold |
| Sub-heading, card title | `text-base`, semibold or medium |
| Body, table cells | `text-sm` |
| Labels, notes | `text-xs`, muted |

- Sentence case everywhere: "Quick wins", not "Quick Wins".
- No em dashes. Use a full stop or a comma.

## Layout

The app follows the shape of LangSmith, the tool most of complydoc's readers
already use: a slim sidebar that collapses to icons, with the mark, the open
report and the pages; a thin bar across the top saying where you are, with the
light and dark switch at its right; and the
page beneath, dense and full width. Findings link to where they are: an
identifier on the Security page opens its document on its page, boxed on the
picture and marked in the text.

## Shape and space

- Radius `0.625rem` for cards, smaller for badges and controls (from shadcn's
  scale).
- Space on Tailwind's 4px grid. `gap-4` inside a group, `gap-8` between groups.
- Separate sections with `SectionStack`, which draws a `Separator` between them.
- Cards are flat: a hairline edge, no heavy shadow.

## Components

Every piece of UI comes from shadcn/ui ([`src/components/ui`](src/components/ui)),
added with its CLI. The complydoc components in [`src/components`](src/components)
only put shadcn parts together:

| Need | Use | Built from |
| --- | --- | --- |
| A page section | `Section`, stacked in `SectionStack` | heading, `Separator` |
| A headline number | `Stat` in a `StatGrid` | `Card` |
| A table of rows | `DataTable` | shadcn's data table: `Table` on TanStack Table |
| A state label | `ToneBadge` (good, neutral, warn, bad) | `Badge` |
| Readiness at a glance | `ReadinessChart` | `Chart` (Recharts donut) |
| Counts or prices by name | `BarList`, one row height for every chart | `Chart` (Recharts horizontal bars) |
| A list of things | `ItemGroup` and `Item` | shadcn |
| A recommendation or caveat | `Alert` | shadcn |
| Nothing to show yet | `Empty` | shadcn |
| Side by side | `ResizablePanelGroup` | shadcn |
| Choosing among a few | `ToggleGroup`, or `Select` for more | shadcn |
| Light or dark | `ModeToggle`, one button at the top right | `Button`, `Tooltip` |
| Navigation | `Sidebar` and `Breadcrumb` | shadcn |

Two things are drawn here, because no shadcn registry has them (checked:
@shadcn, @reui, @kibo-ui, @magicui, @shadcnblocks, @diceui, @tailark):

- the diff marks in a reading ([`DiffText`](src/features/documents/detail/DiffText.tsx)),
  `<mark>` on the theme's tokens: lost words `destructive-soft`, added ones `success-soft`;
- the identifier boxes laid over a page picture ([`PagePicture`](src/features/documents/detail/PagePicture.tsx)),
  each a shadcn `Tooltip` trigger.

## Voice

- Plain, specific and short. "Use pypdf", then the reason.
- Say what was checked and what was not. Never imply a clean result where
  nothing was looked at.
- Name things the way complydoc's report names them: "Person name", "IBAN",
  "Readiness".
