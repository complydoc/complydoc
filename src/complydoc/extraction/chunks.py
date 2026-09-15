"""Inspecting the chunks a text splitter produces.

    from langchain_text_splitters import RecursiveCharacterTextSplitter

    report = cd.inspect_chunks(RecursiveCharacterTextSplitter(chunk_size=800), documents)
    report.stats, report.flag_counts, report.to_pandas()

    comparison = cd.compare_chunkers({"800": small, "1500": large}, documents)

A splitter is a LangChain text splitter (`split_documents`), a LlamaIndex node
parser (`get_nodes_from_documents`), or a callable taking the documents. Documents
are anything `inspect_documents` accepts, including a loader. `inspect_chunks` also
takes chunks that were already made, with no documents.

Each chunk is scanned for identifiers and hidden content and flagged when it is
tiny, oversized, ends mid-sentence or mid-table, ends on a heading, repeats an
earlier chunk, or carries an absolute file path in its metadata. Expected facts are
located per chunk, including facts split across a chunk boundary. `questions`
ranks the chunks for each question with BM25 and reports whether the chunk holding
its answer is retrieved; see `complydoc.extraction.retrieval`.
"""

from __future__ import annotations

import re
import statistics
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from complydoc import offline
from complydoc.config.schema import Config
from complydoc.cost.tokenizer import count_tokens as _count_tokens
from complydoc.extraction.extract import tokenizer_for
from complydoc.extraction.facts import FUZZY_THRESHOLD, Fact, as_facts, find_fact
from complydoc.extraction.retrieval import Question, QuestionResult, as_questions, check_questions
from complydoc.extraction.strings import find_hidden, mask_text, resolve_config, scan_text
from complydoc.loaders.inspection import (
    ABSOLUTE_PATH,
    SOURCE_KEYS,
    document_content,
    load_items,
    loader_name,
)
from complydoc.utils.frames import to_frame

__all__ = [
    "FLAGS",
    "ChunkComparison",
    "ChunkReport",
    "ChunkStats",
    "FactLocation",
    "InspectedChunk",
    "compare_chunkers",
    "inspect_chunks",
]

FLAGS = (
    "tiny",
    "oversized",
    "split_sentence",
    "split_table",
    "heading_at_end",
    "duplicate",
    "path_metadata",
)
"""Flags a chunk can carry."""

_SENTENCE_END = re.compile(r"[.!?:;)\]\"'»”…]\s*$")
_TABLE_LINE = re.compile(r"(\|.*\|)|(\t.*\t)")
_PREVIEW = 120


@dataclass(frozen=True, slots=True)
class InspectedChunk:
    index: int
    document: str | None
    """The source file named in the chunk's metadata."""
    page: int | None
    characters: int
    tokens: int
    identifiers: list[str]
    """Identifiers in the chunk, as `label: masked value`."""
    hidden: int
    """Hidden or instruction-like passages of medium severity or above."""
    flags: list[str]
    metadata_keys: list[str]
    preview: str
    """The start of the chunk with identifiers masked."""


@dataclass(frozen=True, slots=True)
class ChunkStats:
    count: int
    tokens_total: int
    tokens_min: int
    tokens_median: float
    tokens_p95: float
    tokens_max: int


@dataclass(frozen=True, slots=True)
class FactLocation:
    fact: str
    status: str
    """`whole` when one chunk contains it, `split` when only the joined document text
    does, `missing` otherwise."""
    chunks: list[int]


@dataclass(frozen=True, slots=True)
class ChunkReport:
    chunker: str
    chunks: list[InspectedChunk]
    stats: ChunkStats
    token_encoding: str
    token_fidelity: str
    flag_counts: dict[str, int] = field(default_factory=dict)
    repeated_identifiers: dict[str, int] = field(default_factory=dict)
    """Identifiers found in more than one chunk, with the number of chunks."""
    facts: list[FactLocation] = field(default_factory=list)
    retrieval: list[QuestionResult] = field(default_factory=list)
    """One result per question, when questions were given."""
    top_k: int = 5

    @property
    def retrieval_hit_rate(self) -> float | None:
        """Share of questions retrieved within `top_k`. None without questions."""
        if not self.retrieval:
            return None
        retrieved = sum(1 for result in self.retrieval if result.status == "retrieved")
        return round(retrieved / len(self.retrieval), 4)

    @property
    def mean_reciprocal_rank(self) -> float | None:
        """Mean of 1/rank for questions retrieved within `top_k`, 0 for the rest."""
        if not self.retrieval:
            return None
        total = sum(1 / r.rank for r in self.retrieval if r.status == "retrieved" and r.rank)
        return round(total / len(self.retrieval), 4)

    def rows(self) -> list[dict[str, Any]]:
        return [
            {
                "index": c.index,
                "document": c.document,
                "page": c.page,
                "characters": c.characters,
                "tokens": c.tokens,
                "identifiers": len(c.identifiers),
                "hidden": c.hidden,
                "flags": ", ".join(c.flags),
                "preview": c.preview,
            }
            for c in self.chunks
        ]

    def to_pandas(self) -> Any:
        """One row per chunk. Requires the `notebook` extra."""
        return to_frame(self.rows(), list(_CHUNK_COLUMNS))


_CHUNK_COLUMNS = (
    "index", "document", "page", "characters", "tokens", "identifiers", "hidden", "flags", "preview"
)  # fmt: skip


@dataclass(frozen=True, slots=True)
class ChunkComparison:
    reports: dict[str, ChunkReport]

    def rows(self) -> list[dict[str, Any]]:
        rows = []
        for name, report in self.reports.items():
            stats = report.stats
            rows.append(
                {
                    "chunker": name,
                    "chunks": stats.count,
                    "tokens_median": stats.tokens_median,
                    "tokens_p95": stats.tokens_p95,
                    "tokens_max": stats.tokens_max,
                    **{flag: report.flag_counts.get(flag, 0) for flag in FLAGS},
                    "repeated_identifiers": len(report.repeated_identifiers),
                    "facts_whole": sum(1 for f in report.facts if f.status == "whole"),
                    "facts_split": sum(1 for f in report.facts if f.status == "split"),
                    "facts_missing": sum(1 for f in report.facts if f.status == "missing"),
                    "retrieval_hit_rate": report.retrieval_hit_rate,
                    "mean_reciprocal_rank": report.mean_reciprocal_rank,
                }
            )
        return rows

    def to_pandas(self) -> Any:
        """One row per chunker. Requires the `notebook` extra."""
        columns = [
            "chunker", "chunks", "tokens_median", "tokens_p95", "tokens_max", *FLAGS,
            "repeated_identifiers", "facts_whole", "facts_split", "facts_missing",
            "retrieval_hit_rate", "mean_reciprocal_rank",
        ]  # fmt: skip
        return to_frame(self.rows(), columns)


def inspect_chunks(
    splitter: Any,
    documents: Any = None,
    *,
    name: str | None = None,
    config: Config | None = None,
    model: str | None = None,
    min_tokens: int = 20,
    max_tokens: int | None = None,
    facts: Iterable[Fact | str] | None = None,
    fact_threshold: float = FUZZY_THRESHOLD,
    questions: Iterable[Question | Mapping[str, Any] | Sequence[str]] | None = None,
    top_k: int = 5,
) -> ChunkReport:
    """Split `documents` with `splitter` and inspect the chunks.

    With `documents` omitted, `splitter` is taken to be the chunks themselves.
    `max_tokens` enables the `oversized` flag. Token counts use `model`'s encoding,
    or the headline model's.
    """
    settings = resolve_config(config)
    fact_list = as_facts(facts or ())
    question_list = as_questions(questions or ())
    with offline.guarded():
        if documents is None:
            items, label = load_items(splitter), name or "chunks"
        else:
            source = load_items(documents)
            items, label = _split(splitter, source), name or loader_name(splitter)
        chunks = [document_content(item) for item in items]
        whole_texts = (
            _document_texts(source) if documents is not None else [text for text, _ in chunks]
        )
        spec = tokenizer_for(settings, model)
        inspected = _inspect(chunks, settings, spec, min_tokens, max_tokens)

    counts = Counter(value for chunk in inspected for value in set(chunk.identifiers))
    tokens = sorted(chunk.tokens for chunk in inspected)
    encoding = _count_tokens("x", spec)
    return ChunkReport(
        chunker=label,
        chunks=inspected,
        stats=_stats(tokens),
        token_encoding=encoding.encoding,
        token_fidelity=encoding.fidelity,
        flag_counts={flag: sum(flag in c.flags for c in inspected) for flag in FLAGS},
        repeated_identifiers={value: n for value, n in sorted(counts.items()) if n > 1},
        facts=_locate(fact_list, chunks, whole_texts, fact_threshold),
        retrieval=check_questions(
            question_list,
            [(text, _source(metadata)) for text, metadata in chunks],
            whole_texts,
            top_k,
            fact_threshold,
        )
        if question_list
        else [],
        top_k=top_k,
    )


def compare_chunkers(
    chunkers: Mapping[str, Any],
    documents: Any,
    **options: Any,
) -> ChunkComparison:
    """`inspect_chunks` for each named splitter on the same documents."""
    if len(chunkers) < 2:
        raise ValueError(
            "compare_chunkers needs at least two splitters; use inspect_chunks for one"
        )
    return ChunkComparison(
        {
            name: inspect_chunks(splitter, documents, name=name, **options)
            for name, splitter in chunkers.items()
        }
    )


def _split(splitter: Any, documents: list[Any]) -> list[Any]:
    for method in ("split_documents", "get_nodes_from_documents"):
        call = getattr(splitter, method, None)
        if callable(call):
            return list(call(documents))
    if callable(splitter):
        return list(splitter(documents))
    raise TypeError(
        f"cannot split with {type(splitter).__name__}: expected split_documents, "
        f"get_nodes_from_documents, or a callable"
    )


def _source(metadata: Mapping[str, Any]) -> str | None:
    return next((str(metadata[k]) for k in SOURCE_KEYS if metadata.get(k)), None)


def _page(metadata: Mapping[str, Any]) -> int | None:
    for key, offset in (("page_number", 0), ("page", 1)):
        value = metadata.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            return value + offset
    return None


def _document_texts(documents: list[Any]) -> list[str]:
    grouped: dict[str | None, list[str]] = {}
    for item in documents:
        text, metadata = document_content(item)
        grouped.setdefault(_source(metadata), []).append(text)
    return ["\n\n".join(texts) for texts in grouped.values()]


def _inspect(
    chunks: Sequence[tuple[str, dict[str, Any]]],
    settings: Config,
    spec: Any,
    min_tokens: int,
    max_tokens: int | None,
) -> list[InspectedChunk]:
    seen: set[str] = set()
    inspected = []
    for index, (text, metadata) in enumerate(chunks):
        document = _source(metadata)
        following = chunks[index + 1] if index + 1 < len(chunks) else None
        next_text = (
            following[0] if following is not None and _source(following[1]) == document else None
        )
        tokens = _count_tokens(text, spec).tokens
        scan = scan_text(text, config=settings)
        flags = []
        if tokens < min_tokens:
            flags.append("tiny")
        if max_tokens is not None and tokens > max_tokens:
            flags.append("oversized")
        if next_text is not None and _ends_mid_sentence(text, next_text):
            flags.append("split_sentence")
        if next_text is not None and _ends_mid_table(text, next_text):
            flags.append("split_table")
        if _ends_on_heading(text):
            flags.append("heading_at_end")
        normalised = " ".join(text.split())
        if normalised and normalised in seen:
            flags.append("duplicate")
        seen.add(normalised)
        if any(isinstance(v, str) and ABSOLUTE_PATH.match(v) for v in metadata.values()):
            flags.append("path_metadata")
        hidden = [f for f in find_hidden(text, config=settings) if f.severity in ("medium", "high")]
        inspected.append(
            InspectedChunk(
                index=index,
                document=document,
                page=_page(metadata),
                characters=len(text),
                tokens=tokens,
                identifiers=[f"{m.label}: {m.masked}" for m in scan.matches],
                hidden=len(hidden),
                flags=flags,
                metadata_keys=sorted(metadata),
                preview=_masked_preview(text, settings),
            )
        )
    return inspected


def _masked_preview(text: str, settings: Config) -> str:
    return " ".join(mask_text(text[: _PREVIEW * 2], config=settings).text.split())[:_PREVIEW]


def _ends_mid_sentence(text: str, following: str) -> bool:
    stripped, start = text.rstrip(), following.lstrip()
    return (
        bool(stripped) and bool(start) and not _SENTENCE_END.search(stripped) and start[0].islower()
    )


def _last_line(text: str) -> str:
    lines = [line for line in text.splitlines() if line.strip()]
    return lines[-1].strip() if lines else ""


def _ends_mid_table(text: str, following: str) -> bool:
    first = next((line for line in following.splitlines() if line.strip()), "")
    return bool(_TABLE_LINE.search(_last_line(text))) and bool(_TABLE_LINE.search(first))


def _ends_on_heading(text: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return False
    last = lines[-1]
    if last.startswith("#"):
        return True
    words = last.split()
    return 0 < len(words) <= 8 and last.isupper() and not _SENTENCE_END.search(last)


def _stats(tokens: list[int]) -> ChunkStats:
    if not tokens:
        return ChunkStats(0, 0, 0, 0.0, 0.0, 0)
    p95 = tokens[min(len(tokens) - 1, round(0.95 * (len(tokens) - 1)))]
    return ChunkStats(
        count=len(tokens),
        tokens_total=sum(tokens),
        tokens_min=tokens[0],
        tokens_median=float(statistics.median(tokens)),
        tokens_p95=float(p95),
        tokens_max=tokens[-1],
    )


def _locate(
    facts: list[Fact],
    chunks: Sequence[tuple[str, dict[str, Any]]],
    documents: list[str],
    threshold: float,
) -> list[FactLocation]:
    locations = []
    for fact in facts:
        holding = [
            index
            for index, (text, _metadata) in enumerate(chunks)
            if find_fact([(None, text)], fact.text, threshold).kind
        ]
        if holding:
            status = "whole"
        elif any(find_fact([(None, text)], fact.text, threshold).kind for text in documents):
            status = "split"
        else:
            status = "missing"
        locations.append(FactLocation(fact.text, status, holding))
    return locations
