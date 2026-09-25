"""Draw the complydoc mark in characters, for the landing page.

The mark is rasterised from the same geometry as brand/logo/mark-flat.svg (two
leaves and a dot, brand/logo/README.md), and each cell's coverage picks a
character from a ramp.

    python3 landing/scripts/make_ascii.py > landing/src/ascii.ts
"""

import math

RAMP = " .:-=+*#%@"
# A monospace cell is about twice as tall as it is wide at the page's line height.
CELL_ASPECT = 2.0
SAMPLES = 6


def in_leaf(x: float, y: float, a: tuple[float, float], b: tuple[float, float], r: float) -> bool:
    """A leaf is where two discs of radius r, whose circles pass through a and b, overlap."""
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    dx, dy = b[0] - a[0], b[1] - a[1]
    d = math.hypot(dx, dy)
    h = math.sqrt(r * r - (d / 2) ** 2)
    nx, ny = -dy / d, dx / d
    centres = ((mx + nx * h, my + ny * h), (mx - nx * h, my - ny * h))
    return all(math.hypot(x - cx, y - cy) <= r for cx, cy in centres)


def inside(x: float, y: float) -> bool:
    return (
        in_leaf(x, y, (35, 84), (9, 58), 30)
        or in_leaf(x, y, (43, 84), (93, 20), 72)
        or math.hypot(x - 24, y - 34) <= 13
    )


def mark(width: int) -> str:
    """The mark's viewBox is 9 20 84 64."""
    height = round(width * 64 / 84 / CELL_ASPECT)
    rows = []
    for j in range(height):
        row = ""
        for i in range(width):
            hits = sum(
                inside(
                    9 + (i + (si + 0.5) / SAMPLES) * 84 / width,
                    20 + (j + (sj + 0.5) / SAMPLES) * 64 / height,
                )
                for sj in range(SAMPLES)
                for si in range(SAMPLES)
            )
            row += RAMP[round(hits / SAMPLES**2 * (len(RAMP) - 1))]
        rows.append(row.rstrip())
    return "\n".join(rows)


def constant(name: str, text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace("`", "\\`")
    return f"export const {name} = `{escaped}`;\n"


if __name__ == "__main__":
    print("// Written by scripts/make_ascii.py. Run it again rather than editing this file.\n")
    print(constant("MARK", mark(58)))
    print(constant("MARK_SMALL", mark(26)), end="")
