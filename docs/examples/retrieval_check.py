"""Check whether questions retrieve the chunk that answers them, for two chunkers."""

import complydoc as cd

text = cd.extract_text("src/complydoc/sample", ocr=False, mask=False)
documents = [
    {"page_content": chunk.text, "metadata": {"source": chunk.document, "page": chunk.page}}
    for chunk in text.chunks
]


def by_page(docs):
    return list(docs)


def by_sentence(docs):
    return [
        {"page_content": sentence, "metadata": doc["metadata"]}
        for doc in docs
        for sentence in doc["page_content"].split(". ")
        if sentence.strip()
    ]


comparison = cd.compare_chunkers(
    {"page": by_page, "sentence": by_sentence},
    documents,
    questions=[
        cd.Question(
            "Which accounts have no multi-factor authentication?",
            "Two administrator accounts have no multi-factor authentication",
            document="vendor-assessment.pdf",
        ),
        cd.Question(
            "When are invoices payable?",
            "Invoices are payable within",
            document="terms-and-conditions.pdf",
        ),
    ],
    top_k=3,
)

for row in comparison.rows():
    print(row["chunker"], row["chunks"], row["retrieval_hit_rate"], row["mean_reciprocal_rank"])

for result in comparison.reports["sentence"].retrieval:
    print(result.status, result.rank, result.question)
