"""Compare two ways of chunking the sample documents."""

import complydoc as cd

text = cd.extract_text("src/complydoc/sample", ocr=False, mask=False)
documents = [
    {"page_content": chunk.text, "metadata": {"source": chunk.document, "page": chunk.page - 1}}
    for chunk in text.chunks
]


def by_paragraph(docs):
    return [
        {"page_content": part, "metadata": doc["metadata"]}
        for doc in docs
        for part in doc["page_content"].split("\n\n")
        if part.strip()
    ]


def by_line(docs):
    return [
        {"page_content": line, "metadata": doc["metadata"]}
        for doc in docs
        for line in doc["page_content"].splitlines()
        if line.strip()
    ]


comparison = cd.compare_chunkers(
    {"paragraph": by_paragraph, "line": by_line},
    documents,
    facts=["Two administrator accounts have no multi-factor authentication"],
)
for row in comparison.rows():
    print(
        row["chunker"],
        row["chunks"],
        "chunks; tiny:",
        row["tiny"],
        "split sentences:",
        row["split_sentence"],
        "facts split:",
        row["facts_split"],
    )

report = comparison.reports["paragraph"]
print(report.stats)
print(report.repeated_identifiers)
