# complydoc mark

An owl's face, in complydoc green.

## The idea

LangChain's world is birds and LlamaIndex's is llamas; complydoc sits beside
them, so it takes an animal too. An owl because of what it does: it looks
closely, in the dark, at what others miss. complydoc reads documents before a
model does and finds what should not be sent, what is hidden and what a reader
got wrong.

It is drawn in the same vocabulary as LangChain's own mark, flat geometric
pieces set apart by even gaps, so the two read as neighbours: two discs for
eyes with the pupils knocked out and set a little inward, as if focused; two
leaves for ear tufts, angled outward; one leaf for the beak. Seven pieces, one
colour, no outlines.

## Files

```
mark-flat.svg   what ships in the UI: shapes only, currentColor
mark.svg        the same shapes in complydoc green, for a light ground
icon.svg        the icon: the mark in bright green on a near-black tile
```

## Which one, where

**In the UI**, header, footer, card: `mark-flat.svg` inline, coloured with the
theme's primary green, beside the wordmark `complydoc` in Geist semibold,
lowercase. No plate behind it.

**As an icon**, a favicon, a social card or an app tile: `icon.svg`. An icon
has no text around it and no known ground, so it brings its own.

**Large, on a light ground**, a slide or a README banner: `mark.svg`.

## Geometry

Artwork is 100 x 100 with no padding, so it can be placed like a glyph. Eyes
are discs of radius 20 at (28, 54) and (72, 54), 4 apart; pupils are holes of
radius 7.5 set 3 units inward. Tufts are leaves (arcs of radius 17) from
(26, 30) to (8, 6) and mirrored. The beak is a leaf of radius 15 from (50, 72)
to (50, 96).

## Rules

- Inline the flat mark rather than loading it through `img src`, so
  `currentColor` resolves.
- Don't add a plate behind the mark in the UI, stretch it, or outline it.
