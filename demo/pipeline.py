"""An ingestion pipeline, observed: load the contracts, clean them, split them, embed them.

    uv run python pipeline.py            # the pipeline as it was: identifiers go to the model
    uv run python pipeline.py --mask     # with masking added before the split

Each run is a trace in `.complydoc`. Open them with `complydoc ui`.
"""

import sys
from pathlib import Path

from embeddings import OpenAIEmbeddings
from langchain_pymupdf4llm import PyMuPDF4LLMLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

import complydoc as cd

mask = "--mask" in sys.argv

with cd.observe("contracts-ingest"):
    documents = [
        page
        for pdf in sorted(Path("contracts").glob("*.pdf"))
        for page in PyMuPDF4LLMLoader(str(pdf), use_ocr=False).load()
    ]
    documents = cd.StripPathMetadata().transform_documents(documents)
    if mask:
        documents = cd.MaskIdentifiers().transform_documents(documents)

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    chunks = splitter.split_documents(documents)

    OpenAIEmbeddings(model="text-embedding-3-small").embed_documents(
        [chunk.page_content for chunk in chunks]
    )
