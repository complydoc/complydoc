"""Save a baseline, compare a later run with it, and assert on a report."""

import tempfile
from pathlib import Path

import complydoc as cd

document = "src/complydoc/sample/vendor-assessment.pdf"

with tempfile.TemporaryDirectory() as folder:
    baseline = cd.write_json(cd.security_audit(document), Path(folder) / "baseline.json")

    later = cd.security_audit(document)
    changes = cd.diff_reports(cd.load_report(baseline), later)
    print(changes.summary())

    cd.expect(later).no_regressions(baseline).no_failures()

try:
    cd.expect(later).no_hidden(severity="high")
except cd.ExpectationError as error:
    print(error)
