"""The `complydoc` command line.

Each module registers its commands on `app` when imported:

- `audits`: the bare `complydoc`, `audit`, `demo`, `compare-readers` (and its old
  name, `compare`), `cost`, `readiness`, `sensitive`
- `info`: `skill`, `schema`, `doctor`, `models`, `extractors`, `engines`, and
  `pricing-import`, which is hidden from `--help`
- `loaders`: `compare-loaders`
- `chunks`: `chunks`
- `routing`: `routing`
- `check`: `check`
- `diff`: `diff`
- `benchmark`: `benchmark`
- `clean`: `clean`

`common` holds the app, the consoles, the option types and the output helpers.
The network guard is armed before any document is opened, on every path.
"""

from __future__ import annotations

# isort: off
# Imported for the commands they register, in the order `--help` lists them.
from complydoc.cli import audits, routing, loaders, check, diff, clean, chunks, info, benchmark

# isort: on
from complydoc.cli.common import app

__all__ = ["app"]

COMMAND_MODULES = (audits, routing, loaders, check, diff, clean, chunks, info, benchmark)
