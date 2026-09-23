# complydoc mark

A check mark whose two strokes are leaves, with a dot above the short one.

## The idea

complydoc reads documents before a model does and says whether they are fit to
send. The check is that answer. Its strokes are leaves rather than lines, and
it is built the way LangChain's own mark is, from a few flat pieces with even
gaps between them, so the two sit well side by side. The dot above the short
stroke is what makes it complydoc's rather than any tick: a reader, looking
over the check, or the one thing on the page that was found.

## Files

```
mark-flat.svg   what ships in a UI: the shapes only, in currentColor
mark.svg        the same shapes in complydoc green, for a light ground
icon.svg        the icon: the mark in bright green on the near-black tile
avatar.svg      the same without rounded corners, for places that round them,
                such as a GitHub organisation's avatar
social-preview.svg   the 1280 x 640 card GitHub shows when the repository is shared
png/            the same rendered to PNG, for places that take no SVG:
                avatar-1024, icon-1024, icon-512, mark-green, social-preview
```

The PNGs are rendered with `rsvg-convert`, for example:

```bash
rsvg-convert -w 1024 -h 1024 brand/logo/avatar.svg -o brand/logo/png/avatar-1024.png
```

The wordmarks the README shows, the mark beside `complydoc` in Geist semibold,
are `.github/images/logo-light.svg` and `logo-dark.svg`. The HTML report
inlines the same mark and icon from `src/complydoc/report/assets.py`, and the
docs site uses `docs/assets/mark.svg` (white, for the green header) and
`docs/assets/favicon.svg`.

## Which one, where

**In a UI**, header or footer: `mark-flat.svg` inline, in the theme's primary
green, beside the name. No plate behind it.

**As an icon**, a favicon, a social card or an app tile: `icon.svg`. An icon
has no text around it and no known ground, so it brings its own.

**Large, on a light ground**, a slide or a banner: `mark.svg`.

## Geometry

On a 100 unit grid, the artwork spans x 9 to 93 and y 20 to 84; the files crop
to that (`viewBox="9 20 84 64"`) so the mark can be placed like a glyph.

- Short stroke: a leaf from (35, 84) to (9, 58), arcs of radius 30.
- Long stroke: a leaf from (43, 84) to (93, 20), arcs of radius 72. The large
  radius keeps it slim, so it reads as a stroke and not as foliage.
- The two strokes meet low with an 8 unit gap between their feet.
- Dot: radius 13 at (24, 34), above the short stroke.

The icon centres the mark on a 128 tile of radius 28, at 1.05 scale.

## Rules

- Inline the flat mark rather than loading it through `img src`, so
  `currentColor` resolves.
- One colour at a time; don't outline, stretch or add a plate in a UI.
- The name is always lowercase: complydoc.
