"""The extension's entry point: serve the chosen folder over MCP, documents cleaned."""

import argparse

from complydoc.mcp import serve

parser = argparse.ArgumentParser(description=__doc__)
# The extension's settings expand a list of folders as separate arguments after one --folder.
parser.add_argument("--folder", nargs="*", default=[], help="Folders documents may be opened from.")
serve(parser.parse_args().folder)
