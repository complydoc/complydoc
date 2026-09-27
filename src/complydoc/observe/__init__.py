"""Observe an ingestion pipeline as it runs.

    import complydoc as cd

    with cd.observe("contracts-ingest") as run:
        documents = PyPDFLoader("contract.pdf").load()
        chunks = splitter.split_documents(documents)
        vectors = embeddings.embed_documents([c.page_content for c in chunks])

    print(run.summary())

Inside the block, LangChain's loaders, document transformers, text splitters and
embedding models are observed, and so are complydoc's own pipeline steps. Each
call becomes a stage of the trace: what went in and came out, the component's
settings, the time it took, which identifiers were in what it passed on, and
which hosts it reached. Outside the block nothing is touched.

When the block ends, the documents loaded in it are audited as `inspect_documents`
would, each splitter's chunks are inspected as `inspect_chunks` would, and the
report is written to `.complydoc/<name>-<time>.json`, where `complydoc ui` finds it.
"""

from __future__ import annotations

from complydoc.observe.session import Observation, observe, stage

__all__ = ["Observation", "observe", "stage"]
