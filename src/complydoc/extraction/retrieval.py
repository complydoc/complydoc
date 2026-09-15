"""Whether each question's answer can be retrieved from the chunks, by keyword search.

    report = cd.inspect_chunks(
        splitter,
        documents,
        questions=[cd.Question("When is payment due?", "Payment is due within thirty days")],
    )
    report.retrieval, report.retrieval_hit_rate

Each question is ranked against every chunk with BM25, a keyword ranking that
needs no embedding model or index. The chunks holding the question's fact are
found as `inspect_chunks` finds expected facts, and the result says where the
first of them ranks:

- `retrieved`: within the top `top_k`
- `ranked_low`: below the top `top_k`, or sharing no word with the question
- `split`: no single chunk holds the fact, and the text before splitting does
- `missing`: the text does not contain the fact

A split or missing fact fails with any retriever. BM25 ranks by shared words, so
a question phrased differently from its answer ranks low here and may still be
found by an embedding model. The ranks compare splitters on the same questions.
"""

from __future__ import annotations

import math
import os
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePath
from typing import Any

import yaml

from complydoc.extraction.facts import FUZZY_THRESHOLD, find_fact

__all__ = [
    "BM25",
    "Question",
    "QuestionResult",
    "as_questions",
    "check_questions",
    "read_questions",
]

_TOKEN = re.compile(r"\w+")


@dataclass(frozen=True, slots=True)
class Question:
    """A question and a passage that answers it."""

    text: str
    fact: str
    """A passage the answering chunk contains, matched as expected facts are."""
    document: str | None = None
    """File name or relative path holding the answer. None accepts any document."""


@dataclass(frozen=True, slots=True)
class QuestionResult:
    question: str
    fact: str
    status: str
    """`retrieved`, `ranked_low`, `split` or `missing`."""
    rank: int | None
    """Rank of the best-placed chunk holding the fact, from 1. None when no such
    chunk shares a word with the question."""
    answer_chunks: list[int]
    """Indexes of the chunks holding the fact."""
    top_chunks: list[int]
    """Indexes of the `top_k` best-ranked chunks, best first."""


def tokens(text: str) -> list[str]:
    return _TOKEN.findall(unicodedata.normalize("NFKC", text).casefold())


class BM25:
    """Okapi BM25 over a fixed list of texts."""

    def __init__(self, texts: Sequence[str], k1: float = 1.5, b: float = 0.75) -> None:
        self._counts = [Counter(tokens(text)) for text in texts]
        self._lengths = [sum(counts.values()) for counts in self._counts]
        self._average = sum(self._lengths) / len(self._lengths) if self._lengths else 0.0
        frequency: Counter[str] = Counter()
        for counts in self._counts:
            frequency.update(counts.keys())
        total = len(self._counts)
        self._idf = {
            term: math.log((total - df + 0.5) / (df + 0.5) + 1.0) for term, df in frequency.items()
        }
        self._k1 = k1
        self._b = b

    def scores(self, query: str) -> list[float]:
        terms = set(tokens(query))
        scores = []
        for counts, length in zip(self._counts, self._lengths, strict=True):
            relative = length / self._average if self._average else 1.0
            norm = self._k1 * (1 - self._b + self._b * relative)
            score = 0.0
            for term in terms:
                frequency = counts.get(term, 0)
                if frequency:
                    score += self._idf[term] * frequency * (self._k1 + 1) / (frequency + norm)
            scores.append(score)
        return scores

    def ranking(self, query: str) -> list[int]:
        """Indexes of the texts sharing a word with `query`, best first; ties keep order."""
        scores = self.scores(query)
        return sorted((i for i, s in enumerate(scores) if s > 0), key=lambda i: (-scores[i], i))


def as_questions(
    questions: Iterable[Question | Mapping[str, Any] | Sequence[str]],
) -> list[Question]:
    """Questions from `Question` objects, mappings or (question, fact) pairs."""
    result: list[Question] = []
    for item in questions:
        if isinstance(item, Question):
            question = item
        elif isinstance(item, Mapping):
            text, fact = item.get("question", item.get("text")), item.get("fact")
            if not isinstance(text, str) or not isinstance(fact, str):
                raise ValueError(
                    f"a question needs `question` and `fact` strings, got {dict(item)}"
                )
            document = item.get("document")
            question = Question(text, fact, str(document) if document is not None else None)
        elif isinstance(item, Sequence) and not isinstance(item, str) and len(item) == 2:
            question = Question(str(item[0]), str(item[1]))
        else:
            raise TypeError(
                f"a question is a Question, a mapping or a (question, fact) pair, "
                f"not {type(item).__name__}"
            )
        if not question.text.strip() or not question.fact.strip():
            raise ValueError("a question and its fact cannot be empty")
        result.append(question)
    return result


def read_questions(path: str | os.PathLike[str]) -> list[Question]:
    """Questions from a YAML list of mappings with `question`, `fact` and `document`."""
    source = Path(path).expanduser()
    try:
        data = yaml.safe_load(source.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"{source} is not valid YAML ({exc})") from exc
    if not isinstance(data, list) or not data:
        raise ValueError(f"{source} should hold a list of questions")
    return as_questions(data)


def _in_document(document: str | None, name: str | None) -> bool:
    if name is None:
        return True
    return document is not None and name in {document, PurePath(document).name}


def check_questions(
    questions: Sequence[Question],
    chunks: Sequence[tuple[str, str | None]],
    documents: Sequence[str],
    top_k: int = 5,
    threshold: float = FUZZY_THRESHOLD,
) -> list[QuestionResult]:
    """Rank `chunks`, given as (text, source document), for each question.

    `documents` is the text before splitting, which tells a split fact from a
    missing one.
    """
    if top_k < 1:
        raise ValueError("top_k must be at least 1")
    index = BM25([text for text, _ in chunks])
    results = []
    for question in questions:
        holding = [
            i
            for i, (text, document) in enumerate(chunks)
            if _in_document(document, question.document)
            and find_fact([(None, text)], question.fact, threshold).kind
        ]
        ranking = index.ranking(question.text)
        position = {chunk: place for place, chunk in enumerate(ranking, start=1)}
        rank: int | None = None
        if holding:
            placed = [position[i] for i in holding if i in position]
            rank = min(placed) if placed else None
            status = "retrieved" if rank is not None and rank <= top_k else "ranked_low"
        elif any(find_fact([(None, text)], question.fact, threshold).kind for text in documents):
            status = "split"
        else:
            status = "missing"
        results.append(
            QuestionResult(question.text, question.fact, status, rank, holding, ranking[:top_k])
        )
    return results
