"""Get a folder's text with the identifiers covered over, ready to send on."""

import complydoc as cd

result = cd.extract_text("src/complydoc/sample", ocr=False, max_tokens=1000)

for chunk in result.chunks:
    print(f"{chunk.document} p{chunk.page}: {chunk.tokens} tokens ({chunk.token_fidelity})")
    print(f"   {chunk.masked} masked, {chunk.masked_confirmed} of them checksum-backed")

print(f"\n{result.tokens} tokens in total across {len(result.chunks)} chunks")

# Read these before using the text. `complete` is false when something could
# not be read; the best-effort warning is there every time masking runs.
if not result.complete:
    print("\nsomething is missing:")
for warning in result.warnings:
    where = f"{warning.document or 'run'}" + (f" p{warning.page}" if warning.page else "")
    print(f"  [{warning.kind}] {where}: {warning.detail}")
