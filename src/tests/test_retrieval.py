"""Ranking chunks for questions with BM25."""

from __future__ import annotations

import pytest

import complydoc as cd
from complydoc.extraction.retrieval import BM25, check_questions, read_questions

CHUNKS = [
    ("Terms of supply between the parties named below.", "terms.pdf"),
    ("Payment is due within thirty days of the invoice date.", "terms.pdf"),
    ("Deliveries are made to the warehouse on Mondays.", "terms.pdf"),
    ("Payment of the deposit is due on signature.", "order.pdf"),
]
DOCUMENTS = [" ".join(text for text, document in CHUNKS if document == "terms.pdf"), CHUNKS[3][0]]


def test_bm25_prefers_the_chunk_sharing_more_words():
    index = BM25([text for text, _ in CHUNKS])
    assert index.ranking("When is payment due after the invoice?")[0] == 1
    scores = index.scores("warehouse")
    assert scores[2] > 0
    assert scores[0] == 0
    assert index.ranking("warehouse") == [2]


def test_each_status():
    questions = [
        cd.Question("When is payment due after the invoice?", "Payment is due within thirty days"),
        cd.Question("payment due invoice", "Payment of the deposit is due on signature"),
        cd.Question("When are deliveries made?", "invoice date. Deliveries are made"),
        cd.Question("Does the contract renew?", "The contract renews every year"),
    ]
    results = check_questions(questions, CHUNKS, DOCUMENTS, top_k=1)
    assert [(r.status, r.rank) for r in results] == [
        ("retrieved", 1),
        ("ranked_low", 2),
        ("split", None),
        ("missing", None),
    ]
    assert results[0].answer_chunks == [1]
    assert results[0].top_chunks == [1]


def test_a_chunk_sharing_no_word_with_the_question_is_not_retrieved():
    [result] = check_questions(
        [cd.Question("Warehouse location?", "Terms of supply")], CHUNKS, DOCUMENTS, top_k=4
    )
    assert (result.status, result.rank, result.answer_chunks) == ("ranked_low", None, [0])
    assert result.top_chunks == [2]


def test_a_question_can_name_its_document():
    question = cd.Question("When is payment due?", "is due", document="order.pdf")
    [result] = check_questions([question], CHUNKS, DOCUMENTS, top_k=4)
    assert result.answer_chunks == [3]


def by_paragraph(documents):
    return [
        {"page_content": part, "metadata": dict(d["metadata"])}
        for d in documents
        for part in d["page_content"].split("\n\n")
        if part.strip()
    ]


def by_four_words(documents):
    chunks = []
    for d in documents:
        words = d["page_content"].split()
        chunks += [
            {"page_content": " ".join(words[i : i + 4]), "metadata": dict(d["metadata"])}
            for i in range(0, len(words), 4)
        ]
    return chunks


SOURCE = [
    {
        "page_content": "Terms of supply.\n\nPayment is due within thirty days of the invoice "
        "date. Late payment accrues interest.",
        "metadata": {"source": "terms.pdf"},
    }
]


def test_splitters_are_compared_on_the_same_questions():
    questions = [
        cd.Question("When is payment due?", "Payment is due within thirty days"),
        {"question": "Does late payment accrue interest?", "fact": "Late payment accrues interest"},
    ]
    comparison = cd.compare_chunkers(
        {"paragraph": by_paragraph, "words": by_four_words}, SOURCE, questions=questions, top_k=1
    )
    paragraph = comparison.reports["paragraph"]
    assert paragraph.retrieval_hit_rate == 1.0
    assert paragraph.mean_reciprocal_rank == 1.0
    words = comparison.reports["words"]
    assert words.retrieval[0].status == "split"
    rows = {row["chunker"]: row for row in comparison.rows()}
    assert rows["paragraph"]["retrieval_hit_rate"] == 1.0
    assert rows["words"]["retrieval_hit_rate"] < 1.0


def test_no_questions_means_no_retrieval_figures():
    report = cd.inspect_chunks(by_paragraph, SOURCE)
    assert report.retrieval == []
    assert report.retrieval_hit_rate is None
    assert report.mean_reciprocal_rank is None


@pytest.mark.parametrize(
    "bad",
    [{"question": "When?"}, {"fact": "Payment"}, ("", "Payment"), 42],
)
def test_a_malformed_question_is_rejected(bad):
    with pytest.raises((ValueError, TypeError)):
        cd.inspect_chunks(by_paragraph, SOURCE, questions=[bad])


def test_questions_are_read_from_yaml(tmp_path):
    path = tmp_path / "questions.yaml"
    path.write_text(
        "- question: When is payment due?\n"
        "  fact: Payment is due within thirty days\n"
        "  document: terms.pdf\n"
    )
    assert read_questions(path) == [
        cd.Question("When is payment due?", "Payment is due within thirty days", "terms.pdf")
    ]
    path.write_text("question: not a list\n")
    with pytest.raises(ValueError, match="list of questions"):
        read_questions(path)
