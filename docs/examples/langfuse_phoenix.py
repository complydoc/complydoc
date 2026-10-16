"""Record an ingestion run, then point a Langfuse or Phoenix span at it.

The report stays on this machine. `attach_langfuse` and `attach_phoenix` are how a
later LLM span names it. This file does not call them: neither package ships with
complydoc, and both need a network to reach their backend.
"""

import tempfile
from pathlib import Path

from pypdf import PdfReader

import complydoc as cd

path = Path("src/complydoc/sample/terms-and-conditions.pdf")


@cd.stage("split", kind="split")
def split(pages):
    chunks = []
    for page in pages:
        text = page["page_content"]
        meta = dict(page["metadata"])
        if not text:
            chunks.append({"page_content": "", "metadata": meta})
            continue
        start = 0
        while start < len(text):
            chunks.append({"page_content": text[start : start + 800], "metadata": meta})
            start += 720
    return chunks


# Imported above, so the read is a load step. Importing pypdf inside the block is
# observed too.
with cd.observe("contracts-ingest", out=tempfile.mkdtemp()) as run:
    reader = PdfReader(path)
    pages = [
        {
            "page_content": page.extract_text() or "",
            "metadata": {"source": str(path), "page": number},
        }
        for number, page in enumerate(reader.pages, start=1)
    ]
    chunks = split(pages)

if run.report is None or not run.location:
    raise SystemExit(run.error or "the run was not recorded")

# The same check as a policy rule `no_identifiers_sent: {severity: high}`.
cd.expect(run.report).no_identifiers_sent(severity="high")

# What the LLM span carries: the pipeline name and the report path.
link = {"complydoc_run": run.name, "complydoc_report": run.location}
print(run.summary())
print(f"{len(chunks)} chunks")
print(link["complydoc_run"])
print(link["complydoc_report"])


def attach_langfuse(link):
    """Open the Langfuse span that covers the model call, and point it at this run.

    Call it after the `cd.observe` block. The model call belongs inside the `with`,
    where the comment is. Needs `langfuse`, and `LANGFUSE_PUBLIC_KEY`,
    `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL`.
    """
    from langfuse import get_client

    langfuse = get_client()
    with langfuse.start_as_current_observation(as_type="span", name="answer") as span:
        span.update(metadata=link)
        # answer = client.chat.completions.create(...)
        span.update(output="the model's reply")
    langfuse.flush()


def attach_phoenix(link):
    """Open the Phoenix span that covers the model call, and point it at this run.

    Call it after the `cd.observe` block. The model call belongs inside the `with`.
    Needs `arize-phoenix-otel`. `register()` reads `PHOENIX_COLLECTOR_ENDPOINT`
    and, when the server asks for one, `PHOENIX_API_KEY`.
    """
    from opentelemetry import trace
    from phoenix.otel import register

    provider = register(project_name="contracts", batch=False)
    tracer = trace.get_tracer("contracts")
    with tracer.start_as_current_span("answer") as span:
        span.set_attribute("complydoc.run", link["complydoc_run"])
        span.set_attribute("complydoc.report", link["complydoc_report"])
        # answer = client.chat.completions.create(...)
    provider.force_flush()
