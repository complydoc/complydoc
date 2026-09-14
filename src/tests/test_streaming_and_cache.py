"""Streaming audits and cached loader output."""

from __future__ import annotations

import asyncio
import shutil

import pytest

import complydoc as cd
from complydoc import offline
from tests.helpers import FIXTURES


@pytest.fixture
def folder(tmp_path):
    for name in ("native_text.pdf", "sample.docx", "notes.txt"):
        shutil.copy(FIXTURES / name, tmp_path / name)
    return tmp_path


def names(items):
    return sorted(
        item.relative_path if isinstance(item, cd.DocumentReport) else item.path.name
        for item in items
    )


def test_iter_audit_yields_the_documents_and_skips_of_a_full_audit(folder):
    items = list(cd.iter_audit(folder, components=("sensitive",)))
    report = cd.security_audit(folder)
    assert names(items) == sorted(
        [d.relative_path for d in report.documents] + [s.path.name for s in report.skipped]
    )
    assert any(isinstance(item, cd.SkipRecord) for item in items)


def test_the_guard_is_released_between_documents(folder):
    was_armed = offline.is_armed()
    offline.disarm()
    try:
        iterator = cd.iter_audit(folder, components=("sensitive",))
        next(iterator)
        assert not offline.is_armed()
        list(iterator)
    finally:
        if was_armed:
            offline.arm()


def test_aiter_audit_yields_the_same_items(folder):
    async def collect():
        return [item async for item in cd.aiter_audit(folder, components=("sensitive",))]

    assert names(asyncio.run(collect())) == names(cd.iter_audit(folder, components=("sensitive",)))


def test_a_missing_folder_fails_before_iterating(tmp_path):
    with pytest.raises(FileNotFoundError):
        cd.iter_audit(tmp_path / "nowhere")


class Counting:
    """A loader factory that counts how often it parses a file."""

    def __init__(self, suffix: str = "") -> None:
        self.calls = 0
        self.suffix = suffix

    def __call__(self, path: str):
        self.calls += 1
        return [
            {
                "page_content": f"Text of {path}{self.suffix}",
                "metadata": {"source": path, "page": 0},
            }
        ]


@pytest.fixture
def pdfs(tmp_path):
    folder = tmp_path / "docs"
    folder.mkdir()
    for name in ("a.pdf", "b.pdf"):
        (folder / name).write_bytes(b"%PDF-1.4 " + name.encode())
    return folder


def test_a_second_comparison_reads_from_the_cache(pdfs, tmp_path):
    first, second = Counting(), Counting(" again")
    cache = tmp_path / "cache"
    cd.compare_loaders({"first": first, "second": second}, paths=pdfs, cache_dir=cache)
    assert (first.calls, second.calls) == (2, 2)

    report = cd.compare_loaders({"first": first, "second": second}, paths=pdfs, cache_dir=cache)
    assert (first.calls, second.calls) == (2, 2)
    rows = {row.name: row for row in report.loader_comparison.loaders}
    assert rows["first"].cached_files == 2 and rows["first"].documents == 2
    assert any("from the cache" in item.statement for item in report.limitations)


def test_a_changed_file_is_read_again(pdfs, tmp_path):
    loader = Counting()
    cache = tmp_path / "cache"
    cd.compare_loaders({"a": loader, "b": Counting()}, paths=pdfs, cache_dir=cache)
    (pdfs / "a.pdf").write_bytes(b"%PDF-1.4 changed")
    cd.compare_loaders({"a": loader, "b": Counting()}, paths=pdfs, cache_dir=cache)
    assert loader.calls == 3


def test_a_cache_needs_paths(tmp_path):
    with pytest.raises(TypeError, match="cache_dir"):
        cd.compare_loaders(
            {"a": [{"page_content": "x"}], "b": [{"page_content": "y"}]}, cache_dir=tmp_path
        )
