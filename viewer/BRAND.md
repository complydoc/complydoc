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
- The mark is a document inside a dashed boundary, with its last line in the
  brand green: the document, and what is allowed to leave it.
- Use [`Logo`](src/components/Logo.tsx). It draws in `currentColor` and the
  primary green, so it works on light and dark without a second file.
- Keep clear space of at least the mark's inner margin around it. Don't
  recolour, stretch, outline or put it on a busy background.

## Colour

Colour carries state. A colour that doesn't mean anything is grey.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#fbfbfa` | `#16181a` | The page ("paper") |
| `card` | `#ffffff` | `#1d2023` | Cards, tables, panels |
| `foreground` | `#111111` | `#e9e9e7` | Body text ("ink") |
| `muted-foreground` | `#666666` | `#9aa0a6` | Labels, secondary text |
| `faint` | `#999999` | `#71767b` | Footnotes, weights, the least important text |
| `border` | `#e8e8e6` | `#2b2f33` | Card edges, table rules, separators |
| `primary` | `#1a7f4b` | `#4cc38a` | **complydoc green.** Main action, focus ring, the mark |
| `success` / `success-soft` | `#1a7f4b` / `#e3f2ea` | `#4cc38a` / `#1e3a2a` | Ready, kept, recommended |
| `warning` / `warning-soft` | `#b0740f` / `#f7ecd8` | `#d9a441` / `#3a2f1b` | Needs work, close, medium severity |
| `destructive` / `destructive-soft` | `#a4402f` / `#f6e5e1` | `#e08a72` / `#3a2622` | Not ready, missed, high severity |
| `secondary` / `muted` | `#f1f1ef` | `#23272b` | Neutral badges, quiet fills |

Rules:

- Use the token, never the hex value: `text-muted-foreground`, not `text-[#666]`.
- State colours go on a soft fill, as in a badge, not on large areas.
- Green is the brand and "ready" at once, on purpose: a ready document is the
  point of the product.
- The attention red is a brick, not a fire engine. It says "look here", not "danger".
- Dark mode is its own validated palette, not an inversion. Don't write
  `dark:` overrides; the tokens already switch.

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
