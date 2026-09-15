"""HTML and JSON for a chunk inspection and for the changes between two reports.

Both pages share the audit report's stylesheet and script, and carry no document
text beyond what the results already hold: chunk previews and identifiers are
masked, and a diff repeats only the masked subjects of its changes.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import json
from pathlib import Path
from typing import Any

from complydoc import __version__
from complydoc.extraction.chunks import FLAGS, ChunkComparison, ChunkReport
from complydoc.report.assets import FAVICON_URI, LOGO_SVG, template_environment
from complydoc.report.compare import ReportDiff
from complydoc.utils.text import count

__all__ = [
    "chunks_to_dict",
    "diff_to_dict",
    "render_chunks_html",
    "render_diff_html",
    "write_chunks_html",
    "write_chunks_json",
    "write_diff_html",
    "write_diff_json",
]

_FLAG_MEANING = {
    "tiny": "fewer tokens than the minimum",
    "oversized": "more tokens than the maximum",
    "split_sentence": "ends mid-sentence and the next chunk continues it",
    "split_table": "ends inside a table that the next chunk continues",
    "heading_at_end": "ends on a heading, separated from its section",
    "duplicate": "repeats an earlier chunk",
    "path_metadata": "metadata holds an absolute file path",
}


def _common(title: str) -> dict[str, Any]:
    return {
        "title": title,
        "logo_svg": LOGO_SVG,
        "favicon_uri": FAVICON_URI,
        "tool_version": __version__,
        "generated_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "count": count,
    }


def _reports(result: ChunkReport | ChunkComparison) -> list[ChunkReport]:
    return list(result.reports.values()) if isinstance(result, ChunkComparison) else [result]


def render_chunks_html(result: ChunkReport | ChunkComparison, *, source: str = "") -> str:
    """One page for a chunk report, or for a comparison of several splitters."""
    reports = _reports(result)
    return (
        template_environment()
        .get_template("chunks.html.j2")
        .render(
            reports=reports,
            comparison=result if isinstance(result, ChunkComparison) else None,
            flags=FLAGS,
            flag_meaning=_FLAG_MEANING,
            source=source,
            **_common(f"complydoc chunks — {source or ', '.join(r.chunker for r in reports)}"),
        )
    )


def render_diff_html(diff: ReportDiff, *, old: str = "", new: str = "") -> str:
    """One page listing regressions and improvements between two reports."""
    return (
        template_environment()
        .get_template("diff.html.j2")
        .render(
            diff=diff,
            old=old or f"complydoc {diff.old_version}",
            new=new or f"complydoc {diff.new_version}",
            **_common("complydoc diff"),
        )
    )


def write_chunks_html(
    result: ChunkReport | ChunkComparison, path: str | Path, *, source: str = ""
) -> Path:
    """Write a chunk report or splitter comparison as one self-contained HTML file.

    `source` names what was split, for the page heading. Previews and identifiers
    are masked, as they are in the report.
    """
    return _write(Path(path), render_chunks_html(result, source=source))


def write_diff_html(diff: ReportDiff, path: str | Path, *, old: str = "", new: str = "") -> Path:
    """Write the result of `diff_reports` as one self-contained HTML file.

    `old` and `new` label the two reports in the heading, such as their file names.
    """
    return _write(Path(path), render_diff_html(diff, old=old, new=new))


def chunks_to_dict(result: ChunkReport | ChunkComparison) -> dict[str, Any]:
    """Every splitter's report, in the order given."""
    return {
        "tool_version": __version__,
        "chunkers": [
            {
                **dataclasses.asdict(r),
                "retrieval_hit_rate": r.retrieval_hit_rate,
                "mean_reciprocal_rank": r.mean_reciprocal_rank,
            }
            for r in _reports(result)
        ],
    }


def diff_to_dict(diff: ReportDiff) -> dict[str, Any]:
    data = dataclasses.asdict(diff)
    data["regressions"] = len(diff.regressions)
    data["improvements"] = len(diff.improvements)
    return data


def write_chunks_json(result: ChunkReport | ChunkComparison, path: str | Path) -> Path:
    return _write(Path(path), _dumps(chunks_to_dict(result)))


def write_diff_json(diff: ReportDiff, path: str | Path) -> Path:
    return _write(Path(path), _dumps(diff_to_dict(diff)))


def _dumps(data: dict[str, Any]) -> str:
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False, default=str) + "\n"


def _write(path: Path, content: str) -> Path:
    path = path.expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path
