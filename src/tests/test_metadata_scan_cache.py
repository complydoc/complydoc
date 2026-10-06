"""A metadata value repeated in file after file is read by the detectors once."""

from __future__ import annotations

import pytest

from complydoc.loaders import inspection


def test_a_value_shared_by_many_documents_is_scanned_once(
    config, monkeypatch: pytest.MonkeyPatch
) -> None:
    scanned_values: list[str] = []
    real = inspection.scan_text

    def counting(text: str, *args, **kwargs):  # type: ignore[no-untyped-def]
        scanned_values.append(text)
        return real(text, *args, **kwargs)

    monkeypatch.setattr(inspection, "scan_text", counting)
    shared: dict = {}
    found = []
    for number in range(5):
        members = [
            (
                "text",
                {
                    "source": f"/data/contracts/contract-{number}.pdf",
                    "producer": "ReportLab PDF Library - www.reportlab.com",
                    "author": "ana.silva@example.com",
                },
            )
        ]
        findings, _paths = inspection._scan_metadata(members, config, False, shared)
        found.append([f.category for f in findings])
    # The producer and the author are the same five times over; only the paths differ.
    assert scanned_values.count("ReportLab PDF Library - www.reportlab.com") == 1
    assert scanned_values.count("ana.silva@example.com") == 1
    assert len([v for v in scanned_values if v.startswith("/data/contracts/")]) == 5
    # And every document still reports what its metadata holds.
    assert all("email_address" in categories for categories in found)
