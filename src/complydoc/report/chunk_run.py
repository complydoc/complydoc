"""The report of a `complydoc chunks` run: the run itself, and each splitter's chunks.

A chunks run reads the folder's text and splits it; it does not audit the
documents one by one. It is still written as a report, with the same run
record as any other, so `complydoc ui` lists it beside the folder's audits and
shows what the run did not measure as not measured.
"""

from __future__ import annotations

import datetime as dt
import platform
import time
from collections.abc import Sequence
from pathlib import Path

from complydoc import __version__, offline
from complydoc.audit.run import assemble_report
from complydoc.config.schema import Config
from complydoc.extraction.chunks import ChunkReport
from complydoc.ingest import ocr as ocr_module
from complydoc.report.models import SCHEMA_VERSION, AuditReport, RunMetadata

__all__ = ["chunk_run_report"]


def chunk_run_report(
    reports: Sequence[ChunkReport],
    target: str | Path,
    config: Config,
    *,
    started_at: dt.datetime,
    started: float,
    extractor: str | None = None,
    ocr_requested: bool = False,
) -> AuditReport:
    """A report holding `reports` and no documents, for the viewer and `load_report`."""
    run = RunMetadata(
        tool_version=__version__,
        schema_version=SCHEMA_VERSION,
        started_at=started_at.isoformat(timespec="seconds"),
        finished_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        duration_seconds=round(time.monotonic() - started, 3),
        target=str(Path(target).expanduser().resolve()),
        components_run=[],
        config_dir=config.source_dir,
        config_digest=config.digest,
        offline_guard=offline.guard_status(),
        reveal_used=False,
        page_images_used=False,
        extracted_text_used=False,
        ocr_compare_used=False,
        ocr_requested=ocr_requested,
        ocr_available=ocr_module.available(),
        ner_available=False,
        python_version=platform.python_version(),
        monthly_volume=None,
        extractor=extractor or "auto",
    )
    report = assemble_report(config, (), [], [], run)
    report.chunks = list(reports)
    return report
