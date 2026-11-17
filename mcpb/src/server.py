"""The extension's entry point: serve the chosen folder over MCP, documents cleaned."""

import argparse

from complydoc.mcp import serve

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--folder", required=True, help="The folder documents may be opened from.")
serve(parser.parse_args().folder)
