#!/usr/bin/env bash
# Terminal part of the demo. Run from the repository root:  bash examples/demo/run_demo.sh
set -euo pipefail
D=examples/demo
python "$D/make_documents.py" >/dev/null

echo "== 1. What is in these files? =="
complydoc audit "$D/documents" -o "$D/out"

echo; echo "== 2. Do two loaders read the same text? =="
complydoc audit "$D/documents/cv_ana_ferreira.pdf" --compare-extractor pypdf -o "$D/out-cv"

echo; echo "== 3. Safe copies: identifiers masked, metadata removed, PDFs rasterised =="
complydoc clean "$D/documents" --out "$D/clean" --rasterise --show

echo; echo "Open the report viewer with:  complydoc ui $D/out"
