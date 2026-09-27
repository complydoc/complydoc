"""Observe an ingestion pipeline: load, strip paths, split, embed."""
# requires: langchain_pymupdf4llm, langchain_text_splitters

import tempfile
from pathlib import Path

from langchain_core.embeddings import DeterministicFakeEmbedding
from langchain_pymupdf4llm import PyMuPDF4LLMLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

import complydoc as cd

files = sorted(Path("src/complydoc/sample").glob("*.pdf"))[:3]
splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=80)
embeddings = DeterministicFakeEmbedding(size=256)  # stands in for your embedding model

# Written to .complydoc in the working directory unless `out` says otherwise.
with cd.observe("contracts-ingest", out=tempfile.mkdtemp()) as run:
    documents = [page for path in files for page in PyMuPDF4LLMLoader(str(path)).load()]
    documents = cd.StripPathMetadata().transform_documents(documents)
    chunks = splitter.split_documents(documents)
    vectors = embeddings.embed_documents([chunk.page_content for chunk in chunks])

print(run.summary())

# Where the identifiers went: in the documents loaded, and in the text sent to be embedded.
stages = run.report.trace.stages
loaded = {i.fingerprint for stage in stages if stage.kind == "load" for i in stage.identifiers}
embedded = {i.fingerprint for stage in stages if stage.kind == "embed" for i in stage.identifiers}
print(f"{len(loaded)} identifiers loaded, {len(embedded)} in the text embedded")
